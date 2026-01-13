-- Create notification_logs table to track all sent notifications
CREATE TABLE public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.requests(id),
  event_type TEXT NOT NULL,
  recipients TEXT[] NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Allow super_admin and finance to view all notification logs
CREATE POLICY "Super admin and finance can view notification logs"
  ON public.notification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'finance')
    )
  );

-- Allow system to insert notification logs (via edge functions)
CREATE POLICY "System can insert notification logs"
  ON public.notification_logs
  FOR INSERT
  WITH CHECK (true);

-- Allow system to update notification logs status
CREATE POLICY "System can update notification logs"
  ON public.notification_logs
  FOR UPDATE
  USING (true);

-- Add index for efficient queries
CREATE INDEX idx_notification_logs_request_id ON public.notification_logs(request_id);
CREATE INDEX idx_notification_logs_event_type ON public.notification_logs(event_type);
CREATE INDEX idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX idx_notification_logs_created_at ON public.notification_logs(created_at DESC);