import { useQuery } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const AuditLogs = () => {
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id,
          user_id,
          action,
          table_name,
          record_id,
          old_values,
          new_values,
          created_at,
          profiles:user_id(email)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'INSERT':
        return 'default';
      case 'UPDATE':
        return 'secondary';
      case 'DELETE':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <main>
      <Seo title="Audit Logs" description="Beveiligingsaudit logs" canonical="/admin/audit-logs" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Audit Logs</h1>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum & Tijd</TableHead>
                <TableHead>Gebruiker</TableHead>
                <TableHead>Actie</TableHead>
                <TableHead>Tabel</TableHead>
                <TableHead>Record ID</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(log.created_at), 'dd-MM-yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    {log.profiles?.email || log.user_id || 'Systeem'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getActionBadgeVariant(log.action)}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {log.table_name}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.record_id?.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {log.action === 'UPDATE' && log.old_values && log.new_values && (
                      <div className="text-xs space-y-1">
                        {Object.keys(log.new_values).map((key) => {
                          const oldVal = log.old_values[key];
                          const newVal = log.new_values[key];
                          if (oldVal !== newVal && key !== 'updated_at') {
                            return (
                              <div key={key} className="truncate">
                                <span className="font-semibold">{key}:</span>{' '}
                                <span className="text-muted-foreground">
                                  {String(oldVal).substring(0, 20)}...
                                </span>{' '}
                                → {String(newVal).substring(0, 20)}...
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                    {log.action === 'INSERT' && log.new_values && (
                      <div className="text-xs">
                        Nieuw record aangemaakt
                      </div>
                    )}
                    {log.action === 'DELETE' && log.old_values && (
                      <div className="text-xs text-destructive">
                        Record verwijderd
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
};

export default AuditLogs;