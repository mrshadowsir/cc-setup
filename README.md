# cc-setup v4.1

Termux (Android) aur Windows par **Claude Code + free API gateway**, ek rang-birangi dashboard ke saath.
`ccs` likho, dashboard khul jata hai. Terminal band karo, tab bhi background me chalta rahta hai.

> Har command alag box me hai. Box par tap/long-press karke copy karo.

## Android (Termux)

Termux **F-Droid** se install karo (Play Store wala purana hai). Phir:

**Step 1.** Install karo (ek hi command):

```
pkg update -y && pkg install -y git curl && curl -fsSL https://raw.githubusercontent.com/mrshadowsir/cc-setup/main/install.sh | bash
```

`pkg update` fail ho to pehle ye chalao, mirror badlo, phir Step 1 dobara:

```
termux-change-repo
```

**Step 2.** Dashboard apne aap khulta hai. Na khule to terminal me diya link copy karke browser me dalo.

**Step 3.** Dashboard me upar se neeche: Claude **Install**, phir **URL + API key > Save**, phir **Models > Models laao > Test > Lagao**.

**Step 4.** Claude chalane ke liye:

```
ccs claude
```

Agli baar dashboard ke liye sirf:

```
ccs
```

## Hub tab (models, free APIs, OmniRoute)

Dashboard ke neeche **Hub** (⚡) me 3 hisse hain:

- **🤖 Models**: jin providers ki key save hai, un sab ke models ek hi list me. Search karo, provider chip se chhanto, ⭐ favorite banao, **📋 Copy** se naam copy karo, **⚡ Test** se check karo, **Lagao** se seedha Claude me lagao (provider apne aap badal jata hai).
- **🆓 Free APIs**: 16 free providers (Gemini, Groq, OpenRouter, Cerebras, Mistral, NVIDIA, Cloudflare, Z AI, Cohere, GitHub Models, Hugging Face, Kilo, LLM7, OVH, Gonka, Aion) + 2 mushkil signup wale + Ollama (local). Har card me API URL (copy), key lene ka link, free limit, aur **Save / Key test**. Bina key wale providers (Kilo, LLM7, OVH, Ollama) ko **➕ Hub me jodo** se list me lao.
- **🛰️ OmniRoute**: Install (`npm install -g omniroute`), Start/Stop aur Claude se jodna, sab dashboard se. OmniRoute ko Node 22 ya 24+ chahiye (23 nahi).

Cloudflare ke URL me `{account_id}` ki jagah apni Account ID likho.

## Live Preview (👁️ tab)

Dashboard ke **Preview** tab me apna app/website turant dikhta hai, bilkul VS Code ke live preview jaisa:

- **Folder lagao** (ya Task chalao, to preview apne aap usi folder ka ho jata hai). Jaise hi Claude koi file likhta/badalta hai, preview **1 second se kam me** apne aap update hota hai. CSS badle to page reload bhi nahi hota.
- Preview ke andar app ko **chalao, click karo, type karo**, asli ki tarah.
- 📱 Phone / 📲 Tablet / 💻 Laptop / 🖥 Full size, 🔁 ghumao, ⛶ poori screen, ↗ naye tab me.
- Neeche **Console** (errors aur console.log), **Abhi kya badla** (file list) aur Claude ka **live task log**.
- Wahin se naya kaam shuru karo: folder + "kya banana hai" > **Banao**. Folder na ho to bana diya jata hai.
- React / Vite / Next / Flask jaise projects ke liye Type me **Dev server** chuno, command (jaise `npm run dev`) aur port daalo.
- Preview server `127.0.0.1:8789` par chalta hai (`CC_PREVIEW_PORT` se badlo). Sirf tumhare phone/PC par, bahar se koi nahi dekh sakta.

## Battery restriction hatao (zaroori, ek baar)

Taaki Android tumhara kaam beech me na maare:

```
ccs battery
```

Ye wake-lock lagata hai aur battery settings kholta hai. Wahan Termux ke liye **No restrictions** chuno.
Redmi/Xiaomi par **Autostart** bhi ON karo aur Recent apps me Termux ko **Lock** karo.
Dashboard ke Home me bhi 🔋 card hai jisme ye sab buttons hain.

## Windows (VS Code)

```
winget install OpenJS.NodeJS.LTS
```

```
winget install Git.Git
```

VS Code band karke dobara kholo, terminal me:

```
git clone https://github.com/mrshadowsir/cc-setup
```

```
cd cc-setup
```

```
install.bat
```

Agli baar sirf `ccs`.

## Commands

| Command | Kaam |
|---|---|
| `ccs` | dashboard + menu chalu (background me) |
| `ccs claude` | Claude Code chalao |
| `ccs menu` | terminal menu (bina browser ke, Termux ke liye) |
| `ccs update` | naya version GitHub se laao |
| `ccs battery` | battery restriction hatao |
| `ccs apk help` | APK banana |
| `ccs doctor` | sab check |
| `ccs stop` | sab band |

## Model beech me band ho jaye to

Claude Code ek chhote smart proxy (`127.0.0.1:8788`) se baat karta hai. Model fail ho to proxy 2 baar khud retry karta hai, phir request roke rakhta hai (Claude ko error nahi dikhta). Dashboard par laal box aata hai, naya model chuno to kaam wahin se aage badhta hai. Home me "apne aap agla model lagao" on karo to ye bhi apne aap hota hai.

## Direct API (Gemini, Groq wagairah)

Home > Provider me chuno, key daalo, Save. OpenAI-style APIs ke liye proxy translation khud karta hai. `~/.claude/settings.json` me asli key nahi rehti, isliye `claude` seedha mat chalao, hamesha `ccs claude`.

## APK banana

Dashboard ka **APK** tab, ya terminal me:

```
ccs apk new MeraApp
```

Apni website/web app ka folder ho to uska app bana do:

```
ccs apk new MeraApp --web /path/to/folder
```

APK banao (cloud, GitHub Actions par, Termux ke liye best):

```
ccs apk cloud ~/apk-projects/MeraApp
```

Cloud build ke liye ek baar: Plugins tab me **APK Builder** install karo, phir:

```
gh auth login
```

APK ban kar `apk-out` me aati hai, aur Termux me `termux-setup-storage` ke baad Downloads folder me bhi. PC par JDK + Android SDK ho to `ccs apk local FOLDER`.
Plugin install hone par Claude ko bhi ye sab aa jata hai, to tum Task tab me "is app ka APK banao" bol sakte ho.

## Update

Dashboard Home > **Update karo**, ya:

```
ccs update
```

Files GitHub (`mrshadowsir/cc-setup`, branch `main`) se aati hain aur dashboard khud dobara chalu hota hai.

## Files

`cc.js` (tool) · `proxy.js` (smart proxy) · `preview.js` (live preview) · `apk.js` (APK builder) · `dash.html` (dashboard) · `providers.json` · `plugins.json` · `package.json` · `install.sh` · `install.bat` · `README.html` (rangeen guide, browser me kholo)

Sab files ek hi level par hain, koi folder nahi. GitHub par sirf files upload karke kaam chal jata hai.

## Known limits

- Termux par Claude Code `2.1.112` pin hota hai (naye versions Termux par nahi chalte). Badalna ho to `CC_CLAUDE_VER` set karo.
- Android ka battery system alag alag phone par alag hota hai. Upar ke settings ke baad bhi koi phone process maare to `ccs battery app` se app info kholo aur check karo.
- Browser se battery buttons tab hi khulte hain jab Termux ko "Display over other apps" permission ho. Warna Termux me `ccs battery` chalao.
- Local APK build Termux par practical nahi hai (Android SDK nahi chalta), isliye cloud build default hai.
- Free providers ke models roz badalte hain: Hub > Models me dobara test karo.
- Free limits aur URL providers badalte rehte hain (list Nov 2026 me check ki gayi thi). Key lene wale page par ek baar confirm kar lo, aur `providers.json` me badal sakte ho.
- Kuch free providers prompts log ya training me use kar sakte hain (har card ke note me likha hai). Private code/data mat bhejo.
- OmniRoute ka install Termux par aapke phone ke Node version aur native packages par depend karta hai. Fail ho to Logs tab me `job-omniroute` dekho.
