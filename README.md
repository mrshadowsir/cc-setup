# cc-setup

Claude Code + OmniRoute (free API gateway) ka simple manager. Termux aur Windows par, bina Linux/WSL ke.

## Install

**Termux**
```
pkg install -y git
git clone https://github.com/mrshadowsir/cc-setup ~/cc-setup
cd ~/cc-setup && bash install.sh
```

**Windows**
```
git clone https://github.com/mrshadowsir/cc-setup
cd cc-setup
.\install.bat
```

Menu me **Setup** chuno. Ye 3 step ek-ek karke chalata hai. Har step par haan/nahi puchta hai, aur fail ho to wahi ruk jata hai:

1. `pkg update` + `pkg upgrade` (PC par: Node/Git upgrade)
2. Claude Code: latest version check, phir install/update
3. OmniRoute install

Uske baad sab band. Aage ka kaam in short commands se, jab chaho:

```
ccs sys       pkg update + upgrade
ccs claude    Claude install / update
ccs omni      OmniRoute install
ccs start     OmniRoute start (dashboard link dikhata hai)
ccs stop      OmniRoute band
ccs json      OmniRoute ki local JSON banao (path blank = default) + Claude connect
ccs api       API chuno (OmniRoute / OpenRouter / custom) + key daalo + connection test
ccs model     model test karke chuno ya custom naam daalo
ccs run       Claude chalao (OmniRoute band ho to auto-start)
ccs doctor    health check
ccs plugins   plugins (optional, manual)
ccs update    tool update (git pull)
ccs theme     colour theme
ccs reset     default Claude pe wapas
```

## Notes

- Termux par Claude Code 2.1.112 use hota hai. 2.1.113+ glibc binary hai jo Termux (Android) par nahi chalta. Auto-update band rehta hai.
- Plugins ab automatic nahi hain. `ccs plugins` se manual lagao.
- Redmi/MIUI: Termux ko Battery saver "No restrictions" aur Autostart ON karo, warna OmniRoute background me band ho jata hai.
- Files: settings `~/.claude/settings.json`, tool state `~/.cc-setup/config.json`, default JSON `~/.cc-setup/omniroute.local.json`, errors `~/.cc-setup/errors.log`.
