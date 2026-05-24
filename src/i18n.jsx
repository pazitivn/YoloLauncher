import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSetting, setSetting } from './utils/settings';

const T = {
  en: {
    instances:"Instances",accounts:"Accounts",settings:"Settings",home:"Home",servers:"Servers",
    play:"Play",newInstance:"New Instance",configured:"configured",noInstances:"No instances yet",
    createFirst:"Create your Minecraft instance to start playing.",createFirstBtn:"Create First Instance",
    loading:"Loading...",deleteConfirm:"Delete instance",launching:"Launching",
    settingsTitle:"Settings",settingsSubtitle:"Configure launcher behavior and appearance",
    language:"Language",languageLabel:"Interface Language",languageDesc:"Choose between Russian and English",
    russian:"Russian",english:"English",memory:"Memory Allocation",loader:"Loader",
    gameVersion:"Game Version",loaderVersion:"Loader Version",techSettings:"Technical Settings",
    customPath:"Custom Instance Path (Optional)",customJvm:"Custom JVM Arguments (Optional)",
    cancel:"Cancel",create:"Create Instance",edit:"Save Changes",editInstance:"Edit Instance",
    startDownload:"Start Download",installing:"Installing...",ram:"RAM",stop:"Stop",
    nameRequired:"Name is required",selectVersion:"Select a version",snaps:"Snaps",browse:"Browse",
    addAccount:"Add Account",default:"Default",accountsSubtitle:"Manage your Minecraft identities",
    accentColor:"Accent Color",accentDesc:"Choose the main interface color",configure:"Configure",
    accountSettings:"Account Settings",accountSettingsSubtitle:"Customize skin and profile settings",
    skinPreview:"Skin Preview",skinSystem:"Skin System",skinSystemDesc:"Connect to a skin server",
    backToAccounts:"Back",homeSubtitle:"Fast & beautiful Minecraft launcher",
    homeFeature1Title:"Fast Launch",homeFeature1Desc:"Optimized JVM startup for quick game loading",
    homeFeature2Title:"Safe & Offline",homeFeature2Desc:"Offline mode support, no Microsoft account required",
    homeFeature3Title:"Multi-Instance",homeFeature3Desc:"Run and manage multiple Minecraft setups",
    launchPhaseChecking:"Checking files…",launchPhaseStarting:"Starting…",launchPhaseRunning:"Running",
    totalPlayTime:"Total play time",mostPlayed:"Most played",rememberMoment:"Remember this moment",
    noScreenshots:"No screenshots yet",continuePlaying:"Continue playing",daysWithUs:"{n} days with us",
    newsTitle:"Minecraft News",newsSubtitle:"Latest updates from Mojang",loadingNews:"Loading news…",
    newsEmpty:"No news available",newsEmptyDesc:"Check your internet connection",
    readMore:"Read more",allNews:"All news",translated:"Translated",translating:"Translating…",
    readOnWeb:"Open in browser",backToNews:"Back to news",
    serversTitle:"Servers",serversSubtitle:"Your multiplayer history",serversTeaser:"No history yet",
    serversComingSoon:"Servers feature coming soon",
    serversComingSoonDesc:"This section will show servers you've played on.",
    serversModNote:"A Minecraft mod will track your server history and sync it here.",
    open:"Open",
    appearanceSection:"Appearance",themeLabel:"Theme",themeDesc:"Switch between dark and light mode",
    themeDark:"Dark",themeLight:"Light",
    loaderUpdateAvailable:"Loader update available",
    loaderUpdateDesc:"Installed: {current}. Latest: {latest}.",
    loaderUpdateBtn:"Update",loaderVanillaNoUpdate:"Vanilla — no loader updates needed",
    instanceUpdated:"Instance updated!",instanceCreated:"Instance created!",
    instanceDeleted:"deleted",accountAdded:"Account added!",accountRemoved:"Account removed",
    activeAccountUpdated:"Active account updated",installComplete:"Installation complete!",
    downloadFailed:"Download failed",inDevelopment:"In development",
    inDevelopmentDesc:"This section will be available in the next update.",
    latestScreenshot:"Latest screenshot",screenshotFrom:"from {name}",
    saving:"Saving...",save:"Save Changes",
    launchBehaviorLabel:"Launcher behavior after launch",
    launchBehaviorDesc:"What to do with the launcher window when the game starts",
    launchBehaviorKeepOpen:"Keep open",
    launchBehaviorHide:"Minimize to tray, reopen after game",
    launchBehaviorClose:"Close completely",
    openConsoleAfterLaunch:"Open console log window after launch",
  },
  ru: {
    instances:"Сборки",accounts:"Аккаунты",settings:"Настройки",home:"Главная",servers:"Серверы",
    play:"Играть",newInstance:"Новая сборка",configured:"создано",noInstances:"Пока нет сборок",
    createFirst:"Создайте свою сборку Minecraft, чтобы начать играть.",createFirstBtn:"Создать первую сборку",
    loading:"Загрузка...",deleteConfirm:"Удалить сборку",launching:"Запуск",
    settingsTitle:"Настройки",settingsSubtitle:"Настройте поведение и внешний вид лаунчера",
    language:"Язык",languageLabel:"Язык интерфейса",languageDesc:"Выберите между русским и английским",
    russian:"Русский",english:"Английский",memory:"Выделение памяти",loader:"Загрузчик",
    gameVersion:"Версия игры",loaderVersion:"Версия загрузчика",techSettings:"Технические настройки",
    customPath:"Свой путь до папки (необязательно)",customJvm:"Свои аргументы JVM (необязательно)",
    cancel:"Отмена",create:"Создать сборку",edit:"Сохранить",editInstance:"Настройки сборки",
    startDownload:"Установить",installing:"Установка...",ram:"ОЗУ",stop:"Стоп",
    nameRequired:"Введите название",selectVersion:"Выберите версию",snaps:"Снапшоты",browse:"Обзор",
    addAccount:"Добавить аккаунт",default:"По умолчанию",accountsSubtitle:"Управление вашими профилями Minecraft",
    accentColor:"Цвет интерфейса",accentDesc:"Выберите основной акцентный цвет",configure:"Настроить",
    accountSettings:"Настройки аккаунта",accountSettingsSubtitle:"Скины и профиль",
    skinPreview:"Предпросмотр скина",skinSystem:"Система скинов",skinSystemDesc:"Подключиться к серверу скинов",
    backToAccounts:"Назад",homeSubtitle:"Быстрый и красивый лаунчер Minecraft",
    homeFeature1Title:"Быстрый запуск",homeFeature1Desc:"Оптимизированный запуск JVM",
    homeFeature2Title:"Безопасный и офлайн",homeFeature2Desc:"Поддержка офлайн-режима",
    homeFeature3Title:"Мультисборки",homeFeature3Desc:"Управление несколькими версиями Minecraft",
    launchPhaseChecking:"Проверка файлов…",launchPhaseStarting:"Запуск…",launchPhaseRunning:"Играет",
    totalPlayTime:"Времени в игре",mostPlayed:"Любимая сборка",rememberMoment:"Вспомните этот момент",
    noScreenshots:"Скриншотов пока нет",continuePlaying:"Продолжить играть",daysWithUs:"{n} дней с нами",
    newsTitle:"Новости Minecraft",newsSubtitle:"Последние обновления от Mojang",loadingNews:"Загрузка новостей…",
    newsEmpty:"Нет доступных новостей",newsEmptyDesc:"Проверьте подключение к интернету",
    readMore:"Читать далее",allNews:"Все новости",translated:"Переведено",translating:"Перевод…",
    readOnWeb:"Открыть в браузере",backToNews:"Назад к новостям",
    serversTitle:"Серверы",serversSubtitle:"История мультиплеера",serversTeaser:"История пуста",
    serversComingSoon:"Серверы — скоро",
    serversComingSoonDesc:"Здесь будут серверы, на которых вы играли.",
    serversModNote:"Мод для Minecraft будет отслеживать историю серверов.",
    open:"Открыть",
    appearanceSection:"Внешний вид",themeLabel:"Тема",themeDesc:"Переключить тёмную и светлую тему",
    themeDark:"Тёмная",themeLight:"Светлая",
    loaderUpdateAvailable:"Доступно обновление загрузчика",
    loaderUpdateDesc:"Установлено: {current}. Последняя: {latest}.",
    loaderUpdateBtn:"Обновить",loaderVanillaNoUpdate:"Vanilla — загрузчик не нужен",
    instanceUpdated:"Сборка обновлена!",instanceCreated:"Сборка создана!",
    instanceDeleted:"удалена",accountAdded:"Аккаунт добавлен!",accountRemoved:"Аккаунт удалён",
    activeAccountUpdated:"Активный аккаунт обновлён",installComplete:"Установка завершена!",
    downloadFailed:"Ошибка загрузки",inDevelopment:"В разработке",
    inDevelopmentDesc:"Этот раздел появится в следующем обновлении.",
    latestScreenshot:"Последний скриншот",screenshotFrom:"из сборки {name}",
    saving:"Сохранение...",save:"Сохранить",
    launchBehaviorLabel:"Поведение лаунчера после запуска",
    launchBehaviorDesc:"Что делать с окном лаунчера при запуске игры",
    launchBehaviorKeepOpen:"Оставлять открытым",
    launchBehaviorHide:"Скрывать в трей, открывать после игры",
    launchBehaviorClose:"Закрывать полностью",
    openConsoleAfterLaunch:"Открывать окно логов после запуска",
  }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en'); // start with default, load async
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load persisted lang from tauri-plugin-store (or localStorage fallback)
    getSetting('lang', 'en').then(saved => {
      setLangState(saved);
      setReady(true);
    });
  }, []);

  const setLang = async (newLang) => {
    setLangState(newLang);
    await setSetting('lang', newLang);
  };

  const t = (key) => T[lang]?.[key] || T.en[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
