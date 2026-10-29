# cc-setup

Termux ya Windows par (bina Linux/WSL ke) **free API gateway + Claude Code + plugins** ek hi tool se install karo.

## Run kaise kare

**Termux**
```bash
pkg install -y git
git clone https://github.com/<TUMHARA_USERNAME>/cc-setup
cd cc-setup
chmod +x install.sh
./install.sh
```

**Windows (PowerShell ya double-click `install.bat`)**
```powershell
git clone https://github.com/<TUMHARA_USERNAME>/cc-setup
cd cc-setup
.\install.bat
```
Node.js aur Git missing ho to launcher `winget` se khud install kar deta hai.

## Flow

1. **Gateway chuno**: OmniRoute, Claude Code Router, OpenRouter, ya Custom. Jo select karo wo install + (optional) background start hota hai.
2. **Claude Code install**: `npm i -g @anthropic-ai/claude-code`.
3. **API setup**: Manual (URL + key) / local JSON file / gateway ka default URL.
4. **Plugins**: claude-mem, headroom, claude-plugins-official, one-skill-to-rule-them-all, replica-skill. Har ek ke liye alag Y/N poochta hai.
5. **Model tester**: gateway se models ki list laata hai, har model ko chhota message bhejta hai, jo reply de wo working. Phir aap main + small model chun kar set kar sakte ho.

Alag-alag step chalane ke liye: `./install.sh models`, `./install.sh api`, `./install.sh plugins`, `./install.sh gateway`, `./install.sh claude`, `./install.sh launch`.

## Local JSON file format

```json
{
  "base_url": "http://localhost:20128",
  "api_key": "sk-xxxx",
  "model": "model-name"
}
```
`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` naam ya `{"env": {...}}` wala format bhi chalta hai.

## Ye tool kya likhta hai

- `~/.claude/settings.json` ke `env` block me: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{SONNET,OPUS,HAIKU}_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL` (purani file ka `.bak` backup banta hai).
- `~/.claude.json` me `hasCompletedOnboarding: true` (taaki login screen na aaye).
- Apni state: `~/.cc-setup/config.json`, gateway log: `~/.cc-setup/gateway.log`.

## Models test kaise kaam karta hai

`GET <base>/v1/models` se list, phir har model par `POST <base>/v1/messages` (max_tokens 16). Sirf wahi model "working" jo valid reply de. Filter (jaise `free`) aur max count (default 30) laga sakte ho, kyunki OmniRoute/OpenRouter par saikdon models hote hain.

## Gateways aur plugins badalna / add karna

`providers.json` aur `plugins.json` edit karo, code ko haath lagane ki zarurat nahi.

## Known limits (zaroor padho)

- **Termux par Claude Code**: naye versions me native binary ki wajah se `npm install` fail ho sakta hai. Tool aapse purana version poochta hai (`@anthropic-ai/claude-code@<version>`) aur retry karta hai.
- **OmniRoute Termux**: `npx -y omniroute` use hota hai (unke docs ke hisab se). Pehli baar start hone me kaafi time lag sakta hai.
- **Endpoint**: Claude Code `<base>/v1/messages` (Anthropic format) bolta hai. Gateway ko ye support karna chahiye; model tester isi se verify karta hai.
- **headroom** Python package hai (`pip`). Termux par `pkg install python` pehle karo; bhaari dependencies fail ho sakti hain.
- **claude-mem**: `npx claude-mem install` try hota hai, fail ho to marketplace method. Node 20+ chahiye.
- **one-skill-to-rule-them-all** aur **replica-skill**: repo clone hoti hai. Agar `.claude-plugin/marketplace.json` mile to plugin ki tarah, warna `SKILL.md` wale folders `~/.claude/skills/` me copy hote hain. Ye layout detection maine repos ke andar dekh kar verify nahi kiya, isliye fail ho to repo README follow karo.
- Free providers ke rate limits / models roz badalte hain, isliye "working" list kabhi bhi change ho sakti hai: `./install.sh models` dobara chalao.

## GitHub par daalna

```bash
git init
git add .
git commit -m "cc-setup"
git branch -M main
git remote add origin https://github.com/<TUMHARA_USERNAME>/cc-setup.git
git push -u origin main
```
