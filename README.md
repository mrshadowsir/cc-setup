# cc-setup

Claude Code + OmniRoute (free API gateway) ka simple manager.
Mobile (Termux, Redmi/Android) aur Computer (Windows + VS Code) dono ke liye. Bina Linux/WSL ke.

Har command alag line me hai. Ek-ek karke copy-paste karo, har ek ke khatam hone ka wait karo.

---

## A. MOBILE (Redmi / Termux): 0 se complete

**0. Termux lo (sahi jagah se)**
F-Droid ya GitHub releases se. Play Store wala purana hai, usme `pkg` kaam nahi karta.

**1. Pehle package list update**
```
pkg update -y -o Dpkg::Options::=--force-confold
```

**2. Sab packages upgrade**
```
pkg upgrade -y -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef
```

**3. Zaruri packages** (python = plugins ke hooks ke liye, ripgrep = Claude ki search ke liye)
```
pkg install -y git nodejs-lts curl unzip python ripgrep
```

**4. Check karo (teeno ka version aana chahiye)**
```
node -v
npm -v
git --version
```

**5. Tool download**
```
rm -rf ~/cc-setup
git clone https://github.com/mrshadowsir/cc-setup ~/cc-setup
```

**6. Tool kholo**
```
cd ~/cc-setup
bash install.sh
```

**7. Menu me "Setup" chuno.** 3 step ek-ek karke (har step par haan/nahi):
1. `pkg update` + `pkg upgrade`
2. Claude Code (latest check, phir install/update)
3. OmniRoute install

Isi se `ccs` command ban jati hai. Ab kahin se bhi sirf `ccs`.

**8. OmniRoute start**
```
ccs start
```
Jo dashboard link aaye (http://localhost:20128) browser me kholo, wahan free provider connect karo.

**9. Connection banao (koi ek)**
```
ccs json
```
```
ccs api
```
`ccs json` me path blank chhodo to default JSON ban jati hai.

**10. Model chuno (ZARURI, ye step mat chhodna)**
```
ccs model
```
Model set na ho to Claude "sonnet" naam bhejta hai aur OmniRoute galat provider par bhej deta hai (401 error). `ccs run` bhi model na ho to puchta hai.

**11. Claude chalao**
```
ccs run
```

**12. Redmi/MIUI settings (zaruri, warna OmniRoute background me band hota hai)**
- Settings → Apps → Manage apps → Termux → Battery saver → **No restrictions**
- Same jagah **Autostart ON**
- Recent apps me Termux card ko **Lock** karo

**13. Plugins (optional)**
```
ccs plugins
```
"Auto install" recommended plugins ek-ek karke lagata hai. Python pehle khud install karta hai. `claude-mem` Termux par skip hota hai (use Bun chahiye, jo Android par nahi chalta).

**Kuch bhi gadbad ho to ek command:**
```
ccs fix
```
```
ccs doctor
```

---

### Optional, advanced (Termux par latest Claude / claude-mem)
Ye **community** projects hain, official nahi. Apni zimmedari par, pehle repo padho:
- Latest Claude Code Termux par: github.com/ferrumclaudepilgrim/claude-code-android (glibc-runner se binary patch karta hai)
- Bun Termux par (claude-mem ke liye): github.com/tribixbite/bun-on-termux
Tool inhe automatic install nahi karta, kyunki ye binaries patch karte hain.

---

## B. COMPUTER (Windows + VS Code): 0 se complete

**1. VS Code install** (installer me "Add to PATH" tick rakhna)
```
winget install -e --id Microsoft.VisualStudioCode
```
(Ya https://code.visualstudio.com se.)

**2. VS Code kholo, menu: Terminal → New Terminal** (PowerShell wala)

**3. Git + Node (agar nahi hain; install.ps1 bhi khud kar deta hai)**
```
winget install -e --id Git.Git
```
```
winget install -e --id OpenJS.NodeJS.LTS
```

**4. VS Code poora band karke dobara kholo** (taaki PATH mile), phir New Terminal.

**5. Check (teeno ka version aana chahiye)**
```
node -v
npm -v
git --version
```

**6. Tool download**
```
git clone https://github.com/mrshadowsir/cc-setup $HOME\cc-setup
```

**7. Folder me jao**
```
cd $HOME\cc-setup
```

**8. Tool chalao**
```
.\install.bat
```
PowerShell script block kare to:
```
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**9. Menu me "Setup" chuno** (mobile jaisa hi 3 step). Phir **VS Code band karke dobara kholo**, taaki `ccs` mile.

**10. Commands (mobile jaisi hi)**
```
ccs start
ccs json
ccs model
ccs run
```

**11. VS Code extension (optional)**
```
ccs vscode
```
Ye settings wahi `~/.claude/settings.json` se leta hai, isliye OmniRoute wahan bhi chalta hai.

**12. Folder VS Code me kholna ho to**
```
code $HOME\cc-setup
```

PC par Claude Code **latest** version lagta hai.

---

## C. Mac / Linux
```
git clone https://github.com/mrshadowsir/cc-setup ~/cc-setup
cd ~/cc-setup
bash install.sh
```

---

## D. Sab short commands

```
ccs            menu
ccs setup      3-step guided setup
ccs sys        system update (Termux: pkg update + upgrade)
ccs claude     Claude check + install/update
ccs omni       OmniRoute install
ccs start      OmniRoute start (dashboard link dikhata hai)
ccs stop       OmniRoute band
ccs json       OmniRoute ki local JSON banao + Claude connect
ccs api        API chuno + key daalo + connection test
ccs model      model test karke chuno ya custom naam
ccs run        Claude chalao (OmniRoute auto-start)
ccs doctor     health check (net, PATH, node, git, claude, python, ripgrep, gateway)
ccs log        OmniRoute ka log (last 30 lines)
ccs fix        auto-fix (PATH, git, ccs command, settings)
ccs vscode     VS Code extension
ccs plugins    plugins (optional, manual)
ccs update     tool update (git pull)
ccs theme      colour theme
ccs reset      default Claude pe wapas
```

---

## E. Error aaye to

| Problem | Kya karo |
|---|---|
| `ccs: command not found` | `cd ~/cc-setup` phir `node setup.js fix` (PC: VS Code band karke dobara kholo) |
| `git` / `node` / `npm` nahi mila | Termux: `pkg install -y git nodejs-lts`. PC: `winget install -e --id Git.Git` aur `OpenJS.NodeJS.LTS`, phir VS Code restart |
| `pkg update` fail / mirror error | `termux-change-repo`, mirror badlo, phir dobara |
| "Internet nahi mila" | WiFi / data check karo, phir wahi command |
| `claude: command not found` (install ke baad) | `ccs fix`, phir naya terminal |
| Termux par Claude `required file not found` | Naya Claude Android par nahi chalta. `ccs claude` 2.1.112 lagata hai |
| OmniRoute start nahi | `ccs doctor`, phir `tail -20 ~/.cc-setup/gateway.log` |
| Model kaam nahi kar raha | `ccs model` se dobara test |
| Koi bhi error ki detail | `~/.cc-setup/errors.log` |
| Tool update | `cd ~/cc-setup && git pull` |

---

## Notes

- Termux par Claude Code **2.1.112** (2.1.113+ ki native binary Android par nahi chalti). Auto-update band rehta hai.
- Tool har step ke baad check karta hai (internet, npm PATH, tool mila ya nahi). PATH galat ho to khud theek karta hai.
- Plugins automatic nahi hain. `ccs plugins` se manual.
- Files: settings `~/.claude/settings.json`, tool state `~/.cc-setup/config.json`, default JSON `~/.cc-setup/omniroute.local.json`, errors `~/.cc-setup/errors.log`, gateway log `~/.cc-setup/gateway.log`.
