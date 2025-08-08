import { Seo } from "@/components/Seo";

const Users = () => {
  return (
    <main>
      <Seo title="Admin Gebruikers & Rollen" description="Beheer gebruikers en rollen" canonical="/admin/users" />
      <h1 className="text-xl font-semibold">Gebruikers & Rollen</h1>
      <p className="text-muted-foreground">Ken rollen toe en beheer toegang.</p>
    </main>
  );
};

export default Users;
