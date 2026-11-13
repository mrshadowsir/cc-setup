# cc-setup v4

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

`cc.js` (tool) · `proxy.js` (smart proxy) · `apk.js` (APK builder) · `dash.html` (dashboard) · `providers.json` · `plugins.json` · `package.json` · `install.sh` · `install.bat`

Sab files ek hi level par hain, koi folder nahi. GitHub par sirf files upload karke kaam chal jata hai.

## Known limits

- Termux par Claude Code `2.1.112` pin hota hai (naye versions Termux par nahi chalte). Badalna ho to `CC_CLAUDE_VER` set karo.
- Android ka battery system alag alag phone par alag hota hai. Upar ke settings ke baad bhi koi phone process maare to `ccs battery app` se app info kholo aur check karo.
- Browser se battery buttons tab hi khulte hain jab Termux ko "Display over other apps" permission ho. Warna Termux me `ccs battery` chalao.
- Local APK build Termux par practical nahi hai (Android SDK nahi chalta), isliye cloud build default hai.
- Free providers ke models roz badalte hain: Models tab me dobara test karo.
