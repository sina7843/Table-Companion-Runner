# شروع کار Table Companion Runner در ویندوز

این بسته همان مدل Runner مرحله‌ای تمپلیت مرجع را حفظ می‌کند: ۶ فایل CMD، کپی خودکار Prompt بعدی، اجرای دستی هر Prompt در Claude Code، status checklist، baseline Git و guardrailها.

## ترتیب اجرا

### ۱) نصب ابزارها

```text
01-INSTALL-TOOLS.cmd
```

Git for Windows، Node.js LTS، Claude Code و در صورت نیاز Docker Desktop بررسی/نصب می‌شوند. اگر ابزار جدید نصب شد ترمینال را ببندید و دوباره باز کنید.

### ۲) Setup پروژه و baseline بازیابی

```text
02-SETUP-PROJECT.cmd
```

این مرحله Git را آماده می‌کند، guardrailها را تست می‌کند، حداقل یک baseline commit می‌سازد و backup bundle محلی ایجاد می‌کند.

### ۳) بررسی بسته

```text
03-CHECK-PACKAGE.cmd
```

باید promptها، sliceها، helperها، MCP config، guardrailها و baseline Git را تأیید کند.

### ۴) کپی Prompt بعدی

```text
04-COPY-NEXT-PROMPT.cmd
```

بدون آرگومان اولین مورد تیک‌نخورده در `PROJECT_STATUS.md` را کپی می‌کند.

انتخاب دستی:

```bat
04-COPY-NEXT-PROMPT.cmd 03
04-COPY-NEXT-PROMPT.cmd 10a
```

Parentهای `08`، `10` و `11` اجرا نمی‌شوند؛ فقط sliceهای a/b/c را به ترتیب اجرا کنید.

### ۵) Claude Code

```text
05-START-CLAUDE.cmd
```

Prompt کپی‌شده را Paste کنید و در هر نوبت فقط همان یک Prompt/slice را اجرا کنید.

اگر Claude Design login خواست، داخل همان session اجرا کنید:

```text
/design-login
```

بعد از login همان Prompt را ادامه دهید.

### ۶) ساخت env محلی فقط هنگام نیاز

```text
06-CREATE-LOCAL-ENV.cmd
```

Claude اجازه خواندن `.env` واقعی را ندارد. این فایل فقط از `.env.example` برای شما ساخته می‌شود.

## ترتیب Promptها

```text
00 → 01 → 02 → 03 → 04 → 05 → 06 → 07
08a → 08b → 08c
09
10a → 10b → 10c
11a → 11b → 11c
12 → 13 → 14 → 15 → 16 → 17
```

## قبل از TC-00

بعد از موفقیت مراحل 01 تا 03، در Claude Code می‌توانید این بررسی کوتاه را بفرستید:

```text
Read CLAUDE.md, IMPLEMENTATION_DECISIONS.md, Requirements.md, DESIGN_SOURCE.md, PROJECT_STATUS.md, and prompts/QUICK_START.md. Confirm that at least one Git commit exists and that the claude_design MCP configuration is present. Do not implement anything yet. Report only hard blockers and must-fix-first defects for TC-00.
```

## پایان هر Prompt

1. خروجی Claude و تست‌ها را بررسی کنید.
2. `git diff` را ببینید.
3. فقط وقتی مرحله واقعاً کامل است مورد مربوط را در `PROJECT_STATUS.md` تیک بزنید (Claude می‌تواند در پایان مرحله انجام دهد اگر guardrail اجازه status file را بدهد؛ در این بسته status عمداً قابل ویرایش برای اجرای workflow است).
4. commit همان مرحله را بسازید.
5. دوباره `04-COPY-NEXT-PROMPT.cmd` را اجرا کنید.

## Design source

`DESIGN_SOURCE.md` لینک Claude Design، فایل اصلی و تمام importهای Design System را دارد. TC-00 و TC-15 حتماً باید از MCP برای خواندن/مقایسه آن استفاده کنند.
