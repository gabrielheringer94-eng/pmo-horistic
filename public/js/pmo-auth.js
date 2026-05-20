// js/pmo-auth.js
// Sessão + role + redirects. Depende de window.sb (supabase-client.js).

window.pmoAuth = (function () {
  async function getSession() {
    const { data } = await window.sb.auth.getSession();
    return data.session || null;
  }

  async function requireSession(redirectTo = './login.html') {
    const s = await getSession();
    if (!s) { location.href = redirectTo; return null; }
    return s;
  }

  async function signOut() {
    await window.sb.auth.signOut();
    location.href = './login.html';
  }

  async function currentUserId() {
    const { data } = await window.sb.auth.getUser();
    return data?.user?.id || null;
  }

  // Memberships do USUÁRIO logado. Importante filtrar por user_id porque
  // admins de uma org enxergam TODAS as memberships dela via RLS, e a gente
  // só quer o registro do próprio usuário aqui.
  async function loadMemberships() {
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await window.sb
      .from('memberships')
      .select('id, org_id, role, organizations:org_id(name, slug)')
      .eq('user_id', uid);
    if (error) throw error;
    return data || [];
  }

  async function loadAccessibleProjects() {
    const { data, error } = await window.sb
      .from('projects')
      .select('id, name, slug, start_date, total_days, org_id, organizations:org_id(name, slug)')
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  // Role do usuário corrente no project (via org_id). Filtra por user_id
  // pra não pegar memberships de outros usuários (admin enxerga todas).
  async function roleForProject(project) {
    const uid = await currentUserId();
    if (!uid) return null;
    const { data, error } = await window.sb
      .from('memberships')
      .select('role')
      .eq('org_id', project.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return data ? data.role : null;
  }

  return { getSession, requireSession, signOut, loadMemberships, loadAccessibleProjects, roleForProject, currentUserId };
})();
