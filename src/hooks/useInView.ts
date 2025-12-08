import { useEffect, useState, RefObject } from 'react';

/**
 * Hook to detect when an element is in the viewport using Intersection Observer
 * @param ref - Reference to the element to observe
 * @param threshold - Percentage of element visibility to trigger (0.0 to 1.0)
 * @param rootMargin - Margin around the root element (e.g. '100px')
 * @returns Whether the element is currently in view
 */
export function useInView(
    ref: RefObject<Element>,
    {
        threshold = 0.1,
        rootMargin = '50px',
    }: {
        threshold?: number;
        rootMargin?: string;
    } = {}
): boolean {
    const [isInView, setIsInView] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                // Once in view, stay in view (don't re-hide)
                if (entry.isIntersecting) {
                    setIsInView(true);
                }
            },
            {
                threshold,
                rootMargin,
            }
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [ref, threshold, rootMargin]);

    return isInView;
}
