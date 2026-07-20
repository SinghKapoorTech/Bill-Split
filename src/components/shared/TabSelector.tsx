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
    /**
     * Stretch to the full container width and give every tab an equal share of
     * it. Use for filter bars that must show all options at once; leave off for
     * the default content-sized pill (e.g. the 2-tab wizard selector).
     */
    fill?: boolean;
    /**
     * Drop the icons below `md`. With 4+ tabs on a phone there isn't room for
     * both an icon and a full label, and the label is what identifies a filter.
     */
    hideIconsOnMobile?: boolean;
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
export function TabSelector({
    tabs,
    activeTab,
    onTabChange,
    className = '',
    fill = false,
    hideIconsOnMobile = false,
}: TabSelectorProps) {
    return (
        <div
            className={`${fill ? 'grid w-full md:inline-flex md:w-auto' : 'inline-flex'} bg-surface-elevated rounded-lg p-1 gap-1 shadow-sm border border-border ${className}`}
            // Equal columns without needing a dynamic (unsafelisted) grid-cols-N class.
            style={fill ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}
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
              ${fill ? 'tab-fill' : ''}
            `}
                    >
                        {Icon && <Icon className={`icon-sm shrink-0 ${hideIconsOnMobile ? 'hidden md:block' : ''}`} />}
                        <span className="font-medium truncate">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
