import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Receipt, Zap, Home, Repeat, Archive, Loader2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { navigateWithOrigin } from '@/hooks/useReturnTo';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  eventContextForCreate,
  targetFromEventDoc,
  INITIAL_EVENT_CREATE_TARGET,
  type EventCreateTarget,
} from '@/utils/eventCreateTarget';

interface CreateOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventContext?: {
    targetEventId: string;
    targetEventName: string;
  };
}

export function CreateOptionsDialog({
  open,
  onOpenChange,
  eventContext,
}: CreateOptionsDialogProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Depend on the primitives, not the prop object: both nav bars build
  // `eventContext` inline on every render, so an object dependency re-runs the
  // effect (and re-fetches) on every parent render.
  const targetEventId = eventContext?.targetEventId;
  const targetEventName = eventContext?.targetEventName;

  // Starts at `none`, NOT at the incoming context. An event id is only ever a
  // create target once it has been read and found un-archived — see
  // eventCreateTarget.ts for why the unverified window is its own state.
  const [target, setTarget] = useState<EventCreateTarget>(INITIAL_EVENT_CREATE_TARGET);

  useEffect(() => {
    if (!open || !targetEventId) {
      setTarget(INITIAL_EVENT_CREATE_TARGET);
      return;
    }

    let isMounted = true;

    // Clear FIRST, then verify. Between these two lines the dialog is already
    // interactive: seeding the unverified id here is exactly the race that let
    // a bill into an archived event (tap `+`, tap "Quick Expense" before the
    // read lands).
    setTarget({ status: 'checking' });

    const verifyEvent = async () => {
      try {
        const eventDoc = await getDoc(doc(db, 'events', targetEventId));
        if (!isMounted) return;
        setTarget(
          targetFromEventDoc(
            targetEventId,
            eventDoc.exists() ? eventDoc.data() : undefined,
            targetEventName,
          ),
        );
      } catch (error) {
        console.error('Failed to verify event for bill creation:', error);
        // A failed check is an UNVERIFIED event, so it stays out of the
        // wizards. Dropping to a private bill is recoverable; creating into an
        // event we could not check is not.
        if (isMounted) setTarget(INITIAL_EVENT_CREATE_TARGET);
      }
    };
    verifyEvent();

    return () => {
      isMounted = false;
    };
  }, [targetEventId, targetEventName, open]);

  const activeEventContext = eventContextForCreate(target);

  // Hold the options while the event is being verified, instead of letting a
  // fast tap silently resolve the question by dropping the association. That
  // window is short but it is on the COMMON path — every open on an event
  // page — and for an ACTIVE event the silent outcome is wrong: the bill
  // should have gone into the event. `checking` only ever happens when there
  // is an event id to check, so the dashboard's own `+` is never held.
  const isVerifyingEvent = target.status === 'checking';

  const handleAction = (path: string) => {
    navigateWithOrigin(navigate, location, path, activeEventContext);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold pb-1">Create New</DialogTitle>
          {activeEventContext && activeEventContext.targetEventName && (
            <div className="flex justify-center pb-0">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full border border-primary/20">
                <span>Event: {activeEventContext.targetEventName}</span>
                <button
                  onClick={() => setTarget({ status: 'none' })}
                  className="p-0.5 hover:bg-primary/20 rounded-full transition-colors focus:outline-none"
                  aria-label="Remove event association"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          {isVerifyingEvent && (
            <div className="flex justify-center pb-0">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-muted text-muted-foreground text-sm font-medium rounded-full border border-border/60">
                <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                <span>Checking event…</span>
              </div>
            </div>
          )}
          {/* Say it out loud. The event association is dropped here on purpose,
              and the missing badge cannot explain that — the nav bars pass no
              event name, so no badge was ever rendered to go missing. */}
          {target.status === 'archived' && (
            <div className="flex justify-center pb-0">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-muted text-muted-foreground text-sm font-medium rounded-full border border-border/60">
                <Archive className="w-3.5 h-3.5 flex-shrink-0" />
                <span>This event is archived — new bills are saved outside it</span>
              </div>
            </div>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-0 pb-2">
          <button
            disabled={isVerifyingEvent}
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-info/[0.03] hover:border-info/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            onClick={() => handleAction('/bill/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-info/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-info/10 text-info flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm">
              <Receipt className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-info transition-colors">
                New Bill
              </span>
              <span className="text-sm text-muted-foreground mt-0.5">
                Split a detailed expense with friends
              </span>
            </div>
          </button>

          <button
            disabled={isVerifyingEvent}
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-warning/[0.03] hover:border-warning/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            onClick={() => handleAction('/transaction/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-warning/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-warning/10 text-warning flex items-center justify-center group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-sm">
              <Zap className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-warning transition-colors">
                Quick Expense
              </span>
              <span className="text-sm text-muted-foreground mt-0.5">
                Record a fast, simple transaction
              </span>
            </div>
          </button>

          <button
            disabled={isVerifyingEvent}
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-destructive/[0.03] hover:border-destructive/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            onClick={() => handleAction('/airbnb/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-destructive/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-sm">
              <Home className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-destructive transition-colors">
                Airbnb / Hotels
              </span>
              <span className="text-sm text-muted-foreground mt-0.5">
                Split a stay with guests & fees
              </span>
            </div>
          </button>

          <button
            disabled={isVerifyingEvent}
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-success/[0.03] hover:border-success/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            onClick={() => handleAction('/recurring/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-success/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-success/10 text-success flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm">
              <Repeat className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-success transition-colors">
                Recurring Bill
              </span>
              <span className="text-sm text-muted-foreground mt-0.5">
                Auto-charge on a schedule
              </span>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
