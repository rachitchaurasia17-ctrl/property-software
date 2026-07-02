# PlotMap Docs

This folder tracks cleanup guidance for the existing framework-free PlotMap app.

Start here:

- `MAP_ASSET_GUIDE.md` - protected map asset rules and active source folders
- `CLEANUP_NOTES.md` - current audit findings, risks, and phase plan

Primary app route:

```bash
node tools/server.js
# http://localhost:5173/app/plotmap/
```

Do not use `/app/` as the client presentation route. That path currently points at an older demo page and is not the clean client app.
