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

1. **Claude Code pehle**: default Claude hi rahega. Termux par `2.1.112` pin hota hai (naye version Termux par nahi chalte, neeche dekho).
2. **Plugins / skills ek-ek karke**, Claude ke andar: claude-mem, headroom, claude-plugins-official, one-skill-to-rule-them-all, replica-skill. Har ek ke liye alag Y/N.
3. **Gateway + API**: OmniRoute, Claude Code Router, OpenRouter ya Custom. API manual / local JSON file se.
4. **Model**: working models test karo, ya seedha apna **custom model** ka naam daalo (test skip).

Alag-alag step chalane ke liye: `./install.sh claude`, `./install.sh plugins`, `./install.sh gateway`, `./install.sh api`, `./install.sh models`, `./install.sh launch`.

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

- **Termux par Claude Code**: 2.1.113 se Claude Code glibc wali native binary use karta hai, Termux Android ke Bionic par chalta hai, isliye `claude.ai/install.sh` ya naya npm version `required file not found` deta hai. Tool `2.1.112` (aakhri JS build) pin karta hai aur `DISABLE_AUTOUPDATER=1` set karta hai taaki wo khud update hokar na tute.
- Kisi plugin ka installer (jaise `npx claude-mem install`) Claude Code ko khud install karne ki koshish karta hai aur Termux par fail hota hai. Isliye is tool me plugins sirf `claude plugin ...` commands se lagte hain.
- **OmniRoute Termux**: `npx -y omniroute` use hota hai (unke docs ke hisab se). Pehli baar start hone me kaafi time lag sakta hai.
- **Endpoint**: Claude Code `<base>/v1/messages` (Anthropic format) bolta hai. Gateway ko ye support karna chahiye; model tester isi se verify karta hai.
- **headroom** Python package hai (`pip`). Termux par `pkg install python` pehle karo; bhaari dependencies fail ho sakti hain.
- **claude-mem**: marketplace method se lagta hai. Isko Bun chahiye, jo Termux par chalna mushkil hai, isliye Termux par ye fail ho sakta hai (Windows par theek).
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
