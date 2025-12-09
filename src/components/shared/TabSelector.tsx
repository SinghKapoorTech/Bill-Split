import { LucideIcon } from 'lucide-react';

interface Tab {
    id: string;
    label: string;
    icon?: LucideIcon;
}

interface TabSelectorProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
}

/**
 * TabSelector - Modern mobile tab navigation component
 * 
 * Features:
 * - Smooth gradient animations on active tab
 * - Icon + label support
 * - Keyboard accessible
 * - Responsive design
 */
export function TabSelector({ tabs, activeTab, onTabChange, className = '' }: TabSelectorProps) {
    return (
        <div
            className={`inline-flex bg-surface-elevated rounded-lg p-1 gap-1 shadow-sm border border-border ${className}`}
            role="tablist"
            aria-label="Navigation tabs"
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`${tab.id}-panel`}
                        onClick={() => onTabChange(tab.id)}
                        className={`
              tab-base
              ${isActive ? 'tab-active' : 'tab-inactive'}
            `}
                    >
                        {Icon && <Icon className="icon-sm" />}
                        <span className="font-medium">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
