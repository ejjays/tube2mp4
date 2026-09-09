import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { HomeIcon } from '../../assets/icons/HomeIcon';
import { UpdatesIcon } from '../../assets/icons/UpdatesIcon';
import { SettingsIcon } from '../../assets/icons/SettingsIcon';

const GRADIENT =
  'linear-gradient(225deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)';

type Tab = { title: string; icon: typeof HomeIcon; path: string };

const tabs: Tab[] = [
  { title: 'Home', icon: HomeIcon, path: '/' },
  { title: 'Updates', icon: UpdatesIcon, path: '/updates' },
  { title: 'Settings', icon: SettingsIcon, path: '/' },
];

export default function NavTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathTab = location.pathname === '/updates' ? 'updates' : 'home';
  const [activeTab, setActiveTab] = useState(pathTab);
  const [tooltipTab, setTooltipTab] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveTab(pathTab);
  }, [pathTab]);

  const showTooltip = useCallback((title: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltipTab(title);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setTooltipTab(null), 1500);
  }, []);

  const go = (tab: Tab) => {
    setActiveTab(tab.title.toLowerCase());
    navigate(tab.path);
  };

  const handleTap = (tab: Tab) => {
    showTooltip(tab.title);
    scheduleHide();
    go(tab);
  };

  return (
    <div className="nav-tabs">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.title.toLowerCase();
        const isTooltip = tooltipTab === tab.title;
        const iconColor = isActive ? '#22d3ee' : '#64748b';
        const Icon = tab.icon;

        return (
          <div
            key={tab.title}
            className={`tooltip-container ${isActive ? 'active' : ''}`}
            onMouseEnter={() => showTooltip(tab.title)}
            onMouseLeave={scheduleHide}
          >
            <span className={`tooltip ${isTooltip ? 'visible' : ''}`}>
              {tab.title}
            </span>
            <div className="borde-back">
              <div
                className="nt-icon"
                style={{
                  background: isActive ? GRADIENT : 'transparent',
                  boxShadow: isActive ? '0 0 20px rgba(6,182,212,0.5)' : 'none',
                }}
                onClick={() => handleTap(tab)}
              >
                <Icon color={iconColor} />
              </div>
            </div>
            <span
              className="nt-label"
              style={{ color: isActive ? '#22d3ee' : '#64748b' }}
            >
              {tab.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
