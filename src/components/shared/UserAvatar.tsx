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
      <AvatarFallback className={cn(fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
