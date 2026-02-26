import { Person } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaidByBannerProps {
  people: Person[];
  paidById?: string;
  onPaidByChange?: (paidById: string) => void;
}

/**
 * Reusable "Paid by" banner for wizard steps
 */
export function PaidByBanner({
  people,
  paidById,
  onPaidByChange
}: PaidByBannerProps) {
  const { user } = useAuth();

  if (people.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground pt-4 mb-2">
      <span>Paid by</span>
      <Select value={paidById || user?.uid} onValueChange={onPaidByChange}>
        <SelectTrigger className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground w-auto min-w-[3rem] shadow-sm [&>svg]:hidden">
          <SelectValue placeholder="you" />
        </SelectTrigger>
        <SelectContent>
          {people.map((person: Person) => {
            const isMe = person.id === user?.uid || (person as any).userId === user?.uid || person.id === `user-${user?.uid}`;
            const optionValue = isMe && user ? user.uid : person.id;

            return (
              <SelectItem key={person.id} value={optionValue}>
                {isMe ? 'you' : person.name.split(' ')[0]}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <span>and split</span>
      <button className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground shadow-sm">
        equally
      </button>
    </div>
  );
}
