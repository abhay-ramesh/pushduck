package pushduck

// Issuing the token formats that preceded receipts.
//
// The server no longer issues these — presign seals a receipt — but it still
// accepts them until 0.9, for uploads in flight across the deploy. Tests mint
// them exactly as the previous version did.

// signCompletion mints a v1 completion token: a key bound to a route.
func (router *Router) signCompletion(key, route string) (string, error) {
	return router.sealToken(purposeCompletion, map[string]string{"key": key, "route": route})
}

// signSession mints a v1 multipart session.
func (router *Router) signSession(session multipartSession) (string, error) {
	return router.sealToken(purposeSession, session)
}
