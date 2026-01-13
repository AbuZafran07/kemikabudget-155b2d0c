-- Enable realtime for requests table for dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;

-- Enable realtime for division_budgets table for budget updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.division_budgets;