# 🎮 YoloLauncher

**YoloLauncher** — современный Minecraft-лаунчер с открытым исходным кодом, построенный на [Tauri 2](https://tauri.app/) + [React](https://react.dev/).

![Preview](https://img.shields.io/badge/version-0.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)

---

## ✨ Возможности

- 🗂️ **Управление инстансами** — создание, редактирование и запуск нескольких профилей Minecraft
- 👤 **Аккаунты** — поддержка Microsoft (лицензионных) и офлайн-аккаунтов
- 🎨 **Скины** — 3D-просмотр скина игрока прямо в лаунчере (WebGL)
- 📦 **Менеджер контента** — моды, ресурспаки, шейдеры, миры одним кликом
- 💻 **Встроенная консоль** — вывод логов игры в реальном времени
- 📊 **Статистика** — время игры, дата последнего запуска, счётчик запусков
- 🌍 **Локализация** — интерфейс на русском и английском языках
- 🔄 **Миграция** — автоимпорт данных из TLauncher / SKLauncher
- 🖥️ **Кастомный тайтлбар** — нативный внешний вид с кастомными кнопками окна

---

## 🛠️ Стек технологий

| Часть | Технология |
|---|---|
| Frontend | React 19 + Vite 7 |
| Backend | Rust (Tauri 2) |
| UI-библиотека | Vanilla CSS (кастомный дизайн) |
| 3D скины | skinview3d |
| Иконки | lucide-react |
| Хранилище данных | tauri-plugin-store |

---

## 🚀 Установка и запуск (разработка)

### Требования

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (последняя стабильная версия)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

### Шаги

```bash
# Клонируй репозиторий
git clone https://github.com/YOUR_USERNAME/YoloLauncher.git
cd YoloLauncher

# Установи зависимости
npm install

# Запусти в режиме разработки
npm run tauri dev
```

---

## 📦 Сборка релиза

```bash
npm run tauri build
```

Установщик будет в `src-tauri/target/release/bundle/nsis/`.

---

## 📁 Структура проекта

```
YoloLauncher/
├── src/                    # React-фронтенд
│   ├── components/         # Переиспользуемые компоненты
│   ├── pages/              # Страницы лаунчера
│   ├── utils/              # Утилиты (статистика и пр.)
│   └── i18n.jsx            # Локализация
├── src-tauri/              # Rust-бэкенд (Tauri)
│   ├── src/
│   │   ├── accounts.rs     # Управление аккаунтами
│   │   ├── instances.rs    # Управление инстансами
│   │   ├── launch.rs       # Запуск Minecraft
│   │   ├── download.rs     # Загрузка файлов
│   │   ├── skins.rs        # Скины
│   │   ├── content.rs      # Менеджер контента
│   │   ├── migration.rs    # Миграция из других лаунчеров
│   │   ├── java.rs         # Управление Java
│   │   └── python.rs       # PortableMC (Python)
│   └── tauri.conf.json     # Конфигурация Tauri
├── public/                 # Статические ресурсы
└── index.html
```

---

## 🤝 Вклад в проект

Pull request'ы приветствуются! Для крупных изменений сначала откройте Issue.

---

## 📄 Лицензия

[MIT](LICENSE) © 2026 YoloLauncher Team
