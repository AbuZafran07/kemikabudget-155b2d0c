import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RequestList } from '@/components/requests/RequestList';
import { RequestForm } from '@/components/requests/RequestForm';
import { Request } from '@/hooks/useRequests';

type ViewMode = 'list' | 'create' | 'edit' | 'view';

const Requests = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);

  const handleCreateNew = () => {
    setSelectedRequest(null);
    setViewMode('create');
  };

  const handleEdit = (request: Request) => {
    setSelectedRequest(request);
    setViewMode('edit');
  };

  const handleView = (request: Request) => {
    setSelectedRequest(request);
    setViewMode('view');
  };

  const handleBack = () => {
    setSelectedRequest(null);
    setViewMode('list');
  };

  const handleFormSuccess = () => {
    setViewMode('list');
    setSelectedRequest(null);
  };

  return (
    <div className="p-6 space-y-6">
      {viewMode === 'list' ? (
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengajuan</h1>
          <p className="text-muted-foreground">Kelola pengajuan biaya divisi Anda</p>
        </div>
      ) : (
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar
        </Button>
      )}

      {viewMode === 'list' && (
        <RequestList onCreateNew={handleCreateNew} onEdit={handleEdit} onView={handleView} />
      )}

      {(viewMode === 'create' || viewMode === 'edit') && (
        <RequestForm requestId={selectedRequest?.id} onSuccess={handleFormSuccess} onCancel={handleBack} />
      )}

      {viewMode === 'view' && selectedRequest && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-xl font-bold mb-4">{selectedRequest.request_number}</h2>
          <p className="text-muted-foreground">Detail view - {selectedRequest.description}</p>
        </div>
      )}
    </div>
  );
};

export default Requests;
