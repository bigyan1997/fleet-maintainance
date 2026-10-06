---
name: no-wait-for-deploy
description: After pushing, don't sit and poll the orders PC for the auto-deploy; just report it's pushed
metadata:
  type: feedback
---

When the build and tests pass and the change is pushed, say it's pushed and will be live on the orders PC within about 5-10 minutes (Ctrl + F5). Don't poll http://100.66.249.69:8002 waiting for it. The user said on 2026-10-06: "if everything is good, you dont need to wait for orders pc to pick up".

**Why:** waiting for the orders PC made each change feel slow; the auto-deploy is reliable.

**How to apply:** verify locally (build, tests), push, reply right away. Only check the orders PC if the user reports it didn't update. See [[live-server-deploy]].
