import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bill } from '@/types/bill.types';
import { useBillContext } from '@/contexts/BillSessionContext';
import { SessionCard } from './SessionCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Loader2 } from 'lucide-react';

export function SessionList() {
  const { savedSessions, resumeSession, deleteSession, loadSavedSessions } = useBillContext();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSessions = async () => {
      setIsFetching(true);
      await loadSavedSessions();
      setIsFetching(false);
    };
    fetchSessions();
  }, [loadSavedSessions]);

  const handleResume = (sessionId: string) => {
    // Navigate to the home page and pass the session ID in the state
    // The home page will then be responsible for calling the resume function
    navigate('/', { state: { resumeSessionId: sessionId } });
  };

  const handleDelete = async (sessionId: string, receiptFileName?: string) => {
    setProcessingId(sessionId);
    await deleteSession(sessionId, receiptFileName);
    setProcessingId(null);
  };

  const renderContent = () => {
    if (isFetching) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (savedSessions.length === 0) {
      return <p className="text-muted-foreground">You have no saved sessions.</p>;
    }

    return (
      <div className="space-y-4">
        {savedSessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isProcessing={processingId === session.id}
            onResume={() => handleResume(session.id)}
            onDelete={() => handleDelete(session.id, session.receiptFileName)}
          />
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Saved Sessions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
