<div align="center">

<img src="src-tauri/icons/icon.png" width="120" alt="YoloLauncher Logo" />

# YoloLauncher

**Современный лаунчер Minecraft с открытым исходным кодом**

[![Version](https://img.shields.io/badge/version-0.5.0--beta-blueviolet?style=for-the-badge)](https://github.com/pazitivn/YoloLauncher/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue?style=for-the-badge&logo=windows)](https://github.com/pazitivn/YoloLauncher/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange?style=for-the-badge&logo=tauri)](https://tauri.app)

[📦 Скачать](https://github.com/pazitivn/YoloLauncher/releases/latest) · [🐛 Сообщить об ошибке](https://github.com/pazitivn/YoloLauncher/issues) · [💬 Обсуждения](https://github.com/pazitivn/YoloLauncher/discussions)

</div>

---

## О проекте

**YoloLauncher** — это быстрый, красивый и функциональный лаунчер Minecraft, построенный на [Tauri 2](https://tauri.app/) (Rust) + [React 19](https://react.dev/). Поддерживает русский и английский языки, работает полностью нативно без браузерного движка.

## ✨ Возможности

<table>
<tr>
<td>

**👤 Аккаунты**
- Microsoft OAuth (лицензия)
- Offline-режим (без регистрации)
- Несколько аккаунтов одновременно

**🗂️ Инстансы**
- Vanilla, Fabric, Forge, Quilt, NeoForge
- Индивидуальные настройки JVM и RAM
- Кастомный путь установки

**🎨 Скины**
- 3D WebGL просмотр скина
- TLSkins, Ely.by, Microsoft, Custom URL
- Поддержка второго слоя скина

</td>
<td>

**📦 Контент**
- Менеджер модов, ресурспаков, шейдеров
- Управление мирами и скриншотами

**💻 Консоль**
- Встроенный лог Minecraft в реальном времени
- Minecraft-цветовая разметка (§-коды)

**📊 Статистика**
- Время в игре, дата последнего запуска
- Данные хранятся между перезапусками

**🔄 Миграция**
- Автоимпорт из TLauncher / SKLauncher

</td>
</tr>
</table>

## 💾 Установка

> **Windows 10 / 11 (x64)** — другие платформы не поддерживаются в данный момент

1. Перейди на страницу [**Releases**](https://github.com/pazitivn/YoloLauncher/releases/latest)
2. Скачай `YoloLauncher_*_x64-setup.exe`
3. Запусти установщик и следуй инструкции

## 🛠️ Разработка

### Требования

| Инструмент | Версия |
|---|---|
| [Node.js](https://nodejs.org/) | ≥ 18 |
| [Rust](https://rustup.rs/) | stable |
| [Tauri CLI](https://tauri.app/start/prerequisites/) | v2 |

```bash
git clone https://github.com/pazitivn/YoloLauncher.git
cd YoloLauncher
npm install
npm run tauri dev
```

### Сборка релиза

```bash
npm run tauri build
# → src-tauri/target/release/bundle/
```

## 📁 Структура проекта

```
YoloLauncher/
├── src/                        # React frontend
│   ├── components/             # UI компоненты
│   ├── pages/                  # Страницы лаунчера
│   │   └── tabs/               # Вкладки инстанса
│   ├── utils/                  # Утилиты
│   └── i18n.jsx                # Локализация (RU/EN)
└── src-tauri/                  # Rust backend (Tauri 2)
    └── src/
        ├── accounts.rs         # Аккаунты
        ├── instances.rs        # Инстансы
        ├── launch.rs           # Запуск игры
        ├── download.rs         # Загрузка файлов
        ├── skins.rs            # Скины
        ├── content.rs          # Моды, ресурспаки
        ├── migration.rs        # Миграция
        └── java.rs             # Java
```

## 🤝 Участие в разработке

Pull request-ы приветствуются. Для крупных изменений сначала откройте Issue.

## 📄 Лицензия

[MIT](LICENSE) © 2026 YoloLauncher Team
