"""Routes and their lifecycle channels.

A route is a value: a dataclass whose fields are the points where an
application gets to participate. Nothing is subclassed, nothing is registered
by name, and nothing is discovered by reflection.

That shape is not a style preference. It is the only one in which a
misspelling fails::

    Route(authorise=...)
    TypeError: __init__() got an unexpected keyword argument 'authorise'

The alternatives all resolve the hook's name at runtime — ``getattr`` on a
subclass, a string key in a dict, a ``hasattr`` probe — and in every one of
them ``authorise`` is silently a route with no authentication. That failure has
a CVE in Django (2024-39330), one in Rails (2026-33173), and a live example in
django-s3direct, where a typo'd ``auth`` key leaves the endpoint open to
anonymous callers.

The same design appears as ``sentry.ClientOptions`` in Go and
``sentry_sdk.init(before_send=...)`` in Python — the same channels, spelled
idiomatically per language. ``pushduck.Route`` is deliberately the same object
in both, field for field, so one reference page documents both.

Two rules decide whether a channel holds one callable or a list:

* A channel that **produces a value** is a single slot. Two functions cannot
  both *be* the object key.
* A channel that **vetoes, wraps or observes** is a list, applied in order.

Every value-producing channel is named after the value it produces, which is
what makes "authenticate but publish no metadata" expressible without
overloading a return value. It was the absence of that spelling — where the
only way to say it was ``return None`` — that promoted the client's own
metadata to authoritative in an earlier version.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field, fields, replace
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Dict,
    Generic,
    List,
    Mapping,
    Optional,
    Sequence,
    TypeVar,
    Union,
)

from .config import FileMeta, Schema
from .errors import UploadError

TUser = TypeVar("TUser")

#: The user type of a route that authenticates nobody. Spelled as a type
#: rather than ``None`` so ``Route[Anonymous]`` reads as a decision and
#: ``ctx.user`` still has a name a reader can look up.
class Anonymous:
    """No authenticated user. ``ctx.user`` is ``None``."""

    __slots__ = ()


@dataclass
class Completion:
    """A finished upload, as reported to ``on_complete``."""

    key: str
    file: FileMeta
    url: str


@dataclass
class Context(Generic[TUser]):
    """What every channel after ``authorize`` receives.

    Carries the two metadata maps under deliberately different names. Reading
    ``ctx.client_metadata["user_id"]`` is self-documenting as a mistake;
    reading ``ctx.metadata["user_id"]`` is not, which is precisely how
    CVE-2026-33173 happened in Active Storage — one hash held both the client's
    claims and the server's flags, so setting ``identified: true`` bypassed
    server-side content-type detection.
    """

    #: The framework-independent request. Never ``None``.
    request: Any
    #: The route this upload is for.
    route: str
    #: Whatever the ``user`` channel returned, or ``None`` on an anonymous route.
    user: TUser
    #: What the client sent. Untrusted, always. Never merged into ``metadata``.
    client_metadata: Mapping[str, Any] = field(default_factory=dict)
    #: What the server vouches for. Starts empty; only ``metadata`` fills it.
    metadata: Dict[str, Any] = field(default_factory=dict)
    #: The resolved storage path (the S3 object key). Populated before
    #: ``metadata`` runs, so metadata can reference it; ``None`` earlier in the
    #: lifecycle.
    storage_path: Optional[str] = None


# ─── channel signatures ──────────────────────────────────────────────────────
#
# Spelled out so a mis-typed hook is a type error at the construction site
# rather than a surprise at the first upload.

MaybeAwaitable = Union[None, Awaitable[None]]

Authorize = Callable[[Any], MaybeAwaitable]
UserResolver = Callable[[Any], Any]
Around = Callable[["Context[Any]"], AsyncIterator[None]]
Validate = Callable[["Context[Any]", FileMeta], MaybeAwaitable]
StoragePath = Callable[["Context[Any]", FileMeta], Union[str, Awaitable[str]]]
Metadata = Callable[
    ["Context[Any]", FileMeta], Union[Mapping[str, Any], Awaitable[Mapping[str, Any]]]
]
OnComplete = Callable[["Context[Any]", Completion], MaybeAwaitable]
OnError = Callable[["Context[Any]", Optional[FileMeta], BaseException], MaybeAwaitable]


@dataclass
class Route:
    """One named upload endpoint.

    Deliberately *not* generic in the user type, though ``Context`` is. Making
    ``Route`` generic reads well and costs more than it returns: mypy cannot
    infer the parameter from a route that has no ``user`` channel, so every
    construction site — including the common one with no authentication at all
    — reports ``Need type annotation``. A hook that wants a typed user
    annotates its own parameter instead::

        def tenant_key(ctx: Context[User], file: FileMeta) -> str:
            return f"{ctx.user.tenant}/{file.name}"

    which mypy checks inside the body, where the value is actually used. This is
    the point where the Go and Python shapes legitimately diverge: Go infers
    ``Route[T]`` from the struct literal, Python cannot.

    Every channel is optional and every default means exactly one thing, so an
    unset field can never be read as "keep whatever the client sent"::

        Route(
            schema=image(max_size="5MB"),
            authorize=[require_session],
            user=load_user,
            storage_path=lambda ctx, f: f"{ctx.user.tenant}/{f.name}",
            metadata=lambda ctx, f: {"owner_id": ctx.user.id},
            on_complete=[record_upload],
        )

    Composition needs no API: a route is a value, so ``dataclasses.replace``
    derives one from another and stays exhaustive when a channel is added
    later::

        tenant = Route(authorize=[require_session], storage_path=tenant_key)
        avatar = replace(tenant, schema=image(max_size="5MB"))
    """

    #: Size and type constraints. Violations are *per-file* outcomes reported
    #: inside a 200, not request failures.
    schema: Optional[Schema] = None

    #: Runs once per request, before anything else. Raise to reject the whole
    #: request. The return value is ignored — this channel exists so that
    #: "check, but produce nothing" has a spelling that is not ``return None``.
    #: Matches FastAPI's ``dependencies=[Depends(...)]``.
    authorize: Sequence[Authorize] = ()

    #: Runs once per request. Its return value *is* ``ctx.user``.
    user: Optional[UserResolver] = None

    #: Async generators that bracket the whole request — one ``yield`` each,
    #: with everything downstream running at the yield. The only channel that
    #: can wrap rather than transform, which is what a transaction or a tracing
    #: span needs and what an ordered list structurally cannot express.
    around: Sequence[Around] = ()

    #: Runs per file. Raise to fail *that file* while the others continue; the
    #: failure is an entry inside a 200. The channel decides the scope, so the
    #: same exception raised from ``authorize`` is a request-level status.
    validate: Sequence[Validate] = ()

    #: Runs per file. Its return value is a *fragment* of the storage path,
    #: never the whole path: the library rejects traversal, re-sanitises every
    #: segment and appends the disambiguator. Django moved exactly this validation into ``Storage.save``
    #: after CVE-2024-39330, so that no override could bypass it.
    storage_path: Optional[StoragePath] = None

    #: Runs per file. Its return value *is* ``ctx.metadata``. The client's
    #: metadata is never merged in.
    metadata: Optional[Metadata] = None

    #: Runs per file once an upload is confirmed.
    on_complete: Sequence[OnComplete] = ()

    #: Runs on any failure. Observational — raising here does not change the
    #: response the caller already earned.
    on_error: Sequence[OnError] = ()

    #: Reject a completion presenting no token. Off by default so clients older
    #: than the token keep working.
    require_completion_token: bool = False

    def __post_init__(self) -> None:
        # Resolved once, here, rather than sniffed on every request. Sniffing
        # per call is measurable overhead and it is how Scrapy ended up with
        # `process_spider_output_async` — a second method name selected by
        # suffix because the sync/async decision was never made up front.
        for name in ("authorize", "validate", "on_complete", "on_error"):
            object.__setattr__(self, name, tuple(_as_async(fn) for fn in getattr(self, name)))

        for name in ("user", "storage_path", "metadata"):
            fn = getattr(self, name)
            if fn is not None:
                object.__setattr__(self, name, _as_async(fn))

        for fn in self.around:
            if not inspect.isasyncgenfunction(fn):
                raise TypeError(
                    f"`around` takes async generators, got {getattr(fn, '__name__', fn)!r}. "
                    "Write `async def f(ctx): ... yield ...` — everything downstream "
                    "runs at the yield."
                )
        object.__setattr__(self, "around", tuple(self.around))

    def describe(self) -> str:
        """Which channels this route actually has.

        Printed by ``Router.describe()`` at boot. Every comparable library —
        Uppy, Shrine, Express, Koa, grpc-go, tRPC — is unable to answer "what
        runs, in what order?" without reading private attributes, and tusd
        added a ``Capabilities()`` printout for exactly this reason.
        """
        parts: List[str] = []
        for f in fields(self):
            if f.name in ("schema", "require_completion_token"):
                continue
            value = getattr(self, f.name)
            if isinstance(value, tuple):
                if value:
                    parts.append(f"{f.name}({len(value)})")
            elif value is not None:
                parts.append(f.name)
        return " ".join(parts) or "schema only"


def _as_async(fn: Callable[..., Any]) -> Callable[..., Awaitable[Any]]:
    """Normalise a channel to a coroutine function.

    Flask and sync-Django users write ``def``; FastAPI users write
    ``async def``. Forcing either on the other half of the ecosystem would make
    this package feel foreign in it, so both are accepted and the difference is
    resolved once, at registration.
    """
    if not callable(fn):
        raise TypeError(f"channel entries must be callable, got {type(fn).__name__}")

    if inspect.iscoroutinefunction(fn):
        return fn

    async def invoke(*args: Any) -> Any:
        produced = fn(*args)
        # A plain function returning an awaitable — `functools.partial` around a
        # coroutine, or a callable object with an async `__call__` — is still
        # async in every way that matters here.
        if inspect.isawaitable(produced):
            return await produced
        return produced

    invoke.__name__ = getattr(fn, "__name__", "channel")
    invoke.__doc__ = getattr(fn, "__doc__", None)
    return invoke


__all__ = [
    "Anonymous",
    "Completion",
    "Context",
    "Route",
]
