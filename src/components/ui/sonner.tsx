/* Compat shim: the toast implementation moved to app-toast.tsx (the on-brand
 * component from design handoff 67, no sonner underneath). Call sites keep
 * importing { toast } from "@/components/ui/sonner" unchanged. */
export { Toaster, toast } from './app-toast';
