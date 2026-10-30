# cc-setup

Claude Code + free API gateway (OmniRoute etc.) + plugins, ek smart menu se. Termux aur Windows (bina Linux/WSL).

## Install

**Termux**
```
git clone https://github.com/mrshadowsir/cc-setup
cd cc-setup
bash install.sh
```

**Windows**
```
git clone https://github.com/mrshadowsir/cc-setup
cd cc-setup
.\install.bat
```

Menu me **Full setup** chuno. Order: system update → Claude Code → API/gateway + model → plugins (auto, ek-ek karke) → `ccs` shortcut. Baad me kahin se bhi sirf `ccs` likho.

## Commands

```
ccs             smart menu (status dashboard)
ccs setup       ek baar ka full setup
ccs run         Claude chalao (local gateway band ho to auto-start)
ccs plugins     install / hatao / apna GitHub plugin add
ccs gateway     start / stop / dashboard / log
ccs api         profiles, model test, custom model
ccs doctor      health check + fix batata hai
ccs update      tool update (git pull)
ccs theme       colour theme badlo (Cyber, Sunset, Ocean, Matrix, Violet, Mono)
ccs reset       default Claude pe wapas
```

## Notes

- Windows (PC) par bhi sab wahi menu/commands chalte hain. System update ki jagah `winget` se Node + Git upgrade hota hai, aur Claude Code latest version lagta hai (pin sirf Termux par).
- Termux par Claude Code 2.1.112 pin hota hai (naye versions glibc binary use karte hain, Termux par nahi chalte). Auto-update band rehta hai.
- Plugins auto mode me sirf recommended set lagta hai (official marketplace ke 300+ plugins ek saath nahi). Baaki Plugins menu me search karke chuno. Fail hue plugins ka error `~/.cc-setup/errors.log` me hota hai.
- Plugins sirf `claude plugin ...` se lagte hain. GitHub SSH host-key error se bachne ke liye tool git ko HTTPS par force karta hai.
- headroom ke liye Python lagta hai (tool Termux par khud install karta hai). claude-mem ko Bun chahiye, Termux par fail ho sakta hai.
- Custom model: `ccs api` → "Model: custom naam daalo".
- Redmi/MIUI: Termux ko Battery saver "No restrictions" aur Autostart ON karo, warna gateway background me band ho jata hai.
- Files: settings `~/.claude/settings.json`, tool state `~/.cc-setup/config.json`.
