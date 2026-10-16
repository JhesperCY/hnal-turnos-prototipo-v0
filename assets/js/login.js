const Login = {
  async entrar() {
    await Store.pronto;
    const usuario = document.getElementById('usuario').value.trim();
    const clave = document.getElementById('clave').value;
    const u = Store.autenticar(usuario, clave);
    const err = document.getElementById('error-login');
    if (!u) { err.textContent = 'Usuario o contraseña incorrectos.'; return; }
    sessionStorage.setItem('hnal_sesion', JSON.stringify(u));
    window.location.href = u.rol === 'supervisor' ? 'admin.html' : 'modulo.html';
  },
};

document.getElementById('clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') Login.entrar(); });
