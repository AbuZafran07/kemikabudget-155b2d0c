import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RequestList } from '@/components/requests/RequestList';
import { RequestForm } from '@/components/requests/RequestForm';
import { RequestDetail } from '@/components/requests/RequestDetail';
import { Request, RequestFormData } from '@/hooks/useRequests';

type ViewMode = 'list' | 'create' | 'edit' | 'view';

const Requests = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [duplicateData, setDuplicateData] = useState<Partial<RequestFormData> | null>(null);

  const handleCreateNew = () => {
    setSelectedRequest(null);
    setDuplicateData(null);
    setViewMode('create');
  };

  const handleEdit = (request: Request) => {
    setSelectedRequest(request);
    setDuplicateData(null);
    setViewMode('edit');
  };

  const handleView = (request: Request) => {
    setSelectedRequest(request);
    setViewMode('view');
  };

  const handleDuplicate = (request: Request) => {
    // Create a copy of the request data without the ID and status-related fields
    const duplicatedData: Partial<RequestFormData> = {
      category_id: request.category_id,
      description: request.description,
      vendor: request.vendor || '',
      amount: request.amount,
      needed_date: '', // User should set a new date
      funding_source_id: request.funding_source_id || '',
      payment_method: request.payment_method || '',
      beneficiary_name: request.beneficiary_name || '',
      beneficiary_bank: request.beneficiary_bank || '',
      beneficiary_account: request.beneficiary_account || '',
      beneficiary_email: request.beneficiary_email || '',
      notes: request.notes || '',
    };
    
    setSelectedRequest(null);
    setDuplicateData(duplicatedData);
    setViewMode('create');
  };

  const handleBack = () => {
    setSelectedRequest(null);
    setDuplicateData(null);
    setViewMode('list');
  };

  const handleFormSuccess = () => {
    setViewMode('list');
    setSelectedRequest(null);
    setDuplicateData(null);
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
        <RequestList 
          onCreateNew={handleCreateNew} 
          onEdit={handleEdit} 
          onView={handleView}
          onDuplicate={handleDuplicate}
        />
      )}

      {(viewMode === 'create' || viewMode === 'edit') && (
        <RequestForm 
          requestId={selectedRequest?.id} 
          initialData={duplicateData}
          onSuccess={handleFormSuccess} 
          onCancel={handleBack} 
        />
      )}

      {viewMode === 'view' && selectedRequest && (
        <RequestDetail requestId={selectedRequest.id} />
      )}
    </div>
  );
};

export default Requests;
