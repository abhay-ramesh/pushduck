<!--
  A component written the way the docs tell users to write one.

  The point of this fixture is `$upload` — Svelte's auto-subscription. That is
  compiled output, not something the binding controls, and no test that calls
  `subscribe()` by hand exercises it. If the store the binding returns is not
  shaped the way the Svelte compiler expects, this is where it shows up.
-->
<script lang="ts">
  import { createUploadRoute } from "../../svelte";
  import type { UploadClientConfig } from "../../core/upload";

  export let config: UploadClientConfig;

  const upload = createUploadRoute("imageUpload", config);

  // Exposed so the test can trigger an upload without simulating a file
  // picker, which browsers do not allow to be scripted.
  export const uploadFiles = upload.uploadFiles;
  export const reset = upload.reset;
</script>

<progress value={$upload.progress} max="100"></progress>
<span class="status">{$upload.isUploading}</span>
<span class="count">{$upload.files.length}</span>

<ul>
  {#each $upload.files as file (file.id)}
    <li>{file.name}:{file.status}</li>
  {/each}
</ul>

{#each $upload.errors as error}
  <p class="error">{error}</p>
{/each}
