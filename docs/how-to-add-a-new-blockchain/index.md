# How to add a new blockchain

## Objective
When we need to support a new chain, update the following projects and redeploy.

### *Vercel
First add an rpc for the new chain as a shared config on Vercel. Doesn't require a deploy by itself.

for example, add both

```
RPC_URI_FOR_[chainId]	=
VITE_RPC_URI_FOR_[chainId] =
```

### Yearn.fi
- [ ] code changes
- [ ] link to shared rpc in vercel config
- [ ] deploy

### APR Oracle
- [ ] code changes
- [ ] link to shared rpc in vercel config
- [ ] deploy

### Kong
- [ ] code changes
- [ ] New rpc for production, configured on Render
- [ ] New rpc for dev config shared in webops team chat
- [ ] deploy

### yDaemon
- [ ] code changes
- [ ] New rpc for production, configured directly on google cloud vm
- [ ] New rpc for production, configured for github deploy workflow
- [ ] New rpc for dev config shared in webops team chat
- [ ] deploy

### yCMS
- [ ] code changes
- [ ] New rpc for production, configured for github sync workflow
- [ ] deploy

### tokenLists?
- [ ] New rpc for production, configured for github build workflow
- [ ] deploy
