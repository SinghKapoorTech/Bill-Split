import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/utils/nameUtils';
import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'h-12 w-12 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
} as const;

interface UserAvatarProps {
  name: string;
  photoURL?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({
  name,
  photoURL,
  size = 'md',
  className,
  fallbackClassName,
}: UserAvatarProps) {
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {photoURL && (
        <AvatarImage src={photoURL} alt={name} className="object-cover" />
      )}
      {/* text-foreground, not --background: the old value was near-black on dark
          muted and cream on light muted, i.e. unreadable in both themes. */}
      <AvatarFallback className={cn('font-semibold text-foreground', fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
