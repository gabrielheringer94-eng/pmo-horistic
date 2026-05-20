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

  // Carrega memberships do usuário logado. RLS já restringe.
  async function loadMemberships() {
    const { data, error } = await window.sb
      .from('memberships')
      .select('id, org_id, role, organizations:org_id(name, slug)');
    if (error) throw error;
    return data || [];
  }

  // Lista projetos visíveis. RLS já restringe.
  async function loadAccessibleProjects() {
    const { data, error } = await window.sb
      .from('projects')
      .select('id, name, slug, start_date, total_days, org_id, organizations:org_id(name, slug)')
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  // Descobre o role do usuário no project (via org_id do project).
  async function roleForProject(project) {
    const { data, error } = await window.sb
      .from('memberships')
      .select('role')
      .eq('org_id', project.org_id)
      .maybeSingle();
    if (error) throw error;
    return data ? data.role : null;
  }

  return { getSession, requireSession, signOut, loadMemberships, loadAccessibleProjects, roleForProject };
})();
