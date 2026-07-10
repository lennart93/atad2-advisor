import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ds";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/app-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const fieldClass =
  "pr-10 focus-visible:border-brand-terracotta focus-visible:ring-brand-terracotta-soft focus-visible:ring-offset-0";

const labelClass =
  "block text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground";

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowNew(false);
    setShowConfirm(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password");
      return;
    }
    if (!user?.email) {
      setError("No signed-in account found. Sign in again and retry.");
      return;
    }

    setSaving(true);
    try {
      // Confirm the current password before changing anything, so an
      // unattended open session cannot silently take over the account.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (reauthError) {
        setError("Current password is incorrect");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast.error("Could not update password", {
          description: updateError.message,
        });
        return;
      }

      toast.success("Password updated", {
        description: "The new password is active from now on.",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error("Something went wrong", { description: "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md rounded-sm border-t-[3px] border-t-brand-terracotta bg-card">
        <DialogHeader>
          <DialogTitle className="font-normal">Change password</DialogTitle>
          <DialogDescription>
            Enter the current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="currentPassword" className={labelClass}>
              Current password
            </label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setError("");
              }}
              placeholder="Enter current password"
              className={fieldClass}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="newPasswordDialog" className={labelClass}>
              New password
            </label>
            <div className="relative">
              <Input
                id="newPasswordDialog"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
                placeholder="Enter new password"
                className={fieldClass}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <UiButton
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </UiButton>
            </div>
            <p className="text-[11px] text-muted-foreground">At least 8 characters</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPasswordDialog" className={labelClass}>
              Confirm new password
            </label>
            <div className="relative">
              <Input
                id="confirmPasswordDialog"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError("");
                }}
                placeholder="Re-enter new password"
                className={fieldClass}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <UiButton
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </UiButton>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !currentPassword ||
                newPassword.length < 8 ||
                confirmPassword.length < 8
              }
            >
              {saving ? "Updating..." : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
