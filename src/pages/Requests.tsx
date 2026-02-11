import { useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { RequestList } from '@/components/requests/RequestList';
import { RequestForm } from '@/components/requests/RequestForm';
import { RequestDetail } from '@/components/requests/RequestDetail';
import { Request, RequestFormData } from '@/hooks/useRequests';
import { useLanguage } from '@/contexts/LanguageContext';


type ViewMode = 'list' | 'create' | 'edit' | 'view';

const Requests = () => {
  const { t } = useLanguage();
  
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [duplicateData, setDuplicateData] = useState<Partial<RequestFormData> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleCreateNew = () => {
    setSelectedRequest(null);
    setDuplicateData(null);
    setSheetOpen(true);
    setViewMode('create');
  };

  const handleEdit = (request: Request) => {
    setSelectedRequest(request);
    setDuplicateData(null);
    setSheetOpen(true);
    setViewMode('edit');
  };

  const handleView = (request: Request) => {
    setSelectedRequest(request);
    setViewMode('view');
  };

  const handleDuplicate = (request: Request) => {
    const duplicatedData: Partial<RequestFormData> = {
      category_id: request.category_id,
      description: request.description,
      vendor: request.vendor || '',
      amount: request.amount,
      needed_date: '',
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
    setSheetOpen(true);
    setViewMode('create');
  };

  const handleBack = () => {
    setSelectedRequest(null);
    setDuplicateData(null);
    setViewMode('list');
  };

  const handleFormSuccess = () => {
    setSheetOpen(false);
    setViewMode('list');
    setSelectedRequest(null);
    setDuplicateData(null);
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    setViewMode('list');
    setSelectedRequest(null);
    setDuplicateData(null);
  };

  return (
    <div className="p-6 space-y-6">
      {viewMode === 'view' && selectedRequest ? (
        <RequestDetail requestId={selectedRequest.id} onBack={handleBack} />
      ) : (
        <>
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Expense Request</h1>
              <p className="text-muted-foreground">{t('requests.description')}</p>
            </div>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('requests.createNew')}
            </Button>
          </div>

          {/* Request List */}
          <RequestList 
            onCreateNew={handleCreateNew} 
            onEdit={handleEdit} 
            onView={handleView}
            onDuplicate={handleDuplicate}
          />
        </>
      )}

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-xl overflow-y-auto"
        >
          <SheetHeader className="pb-4">
            <SheetTitle>
              {viewMode === 'edit' ? t('requests.edit') : t('requests.createNewTitle')}
            </SheetTitle>
            <SheetDescription>
              {t('requests.formDescription')}
            </SheetDescription>
          </SheetHeader>
          <RequestForm 
            requestId={selectedRequest?.id} 
            initialData={duplicateData}
            onSuccess={handleFormSuccess} 
            onCancel={handleSheetClose}
            isSheet={true}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Requests;
