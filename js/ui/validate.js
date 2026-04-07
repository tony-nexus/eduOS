/**
 * js/ui/validate.js
 * Validação centralizada de formulários.
 * Exibe erros inline (campo vermelho + mensagem) e valida antes do submit.
 */

// ─── Inline field feedback ────────────────────────────────────────────────────

export function fieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.classList.add('has-error');
  el.setAttribute('aria-invalid', 'true');
  const errId = id + '-err';
  el.setAttribute('aria-describedby', errId);
  let span = el.parentElement.querySelector('.field-error-msg');
  if (!span) {
    span = document.createElement('span');
    span.className = 'field-error-msg';
    span.setAttribute('role', 'alert');
    el.parentElement.appendChild(span);
  }
  span.id = errId;
  span.textContent = msg;
  return false;
}

export function fieldOk(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('has-error');
  el.removeAttribute('aria-invalid');
  el.removeAttribute('aria-describedby');
  el.parentElement.querySelector('.field-error-msg')?.remove();
}

export function clearErrors(...ids) {
  ids.forEach(id => fieldOk(id));
}

// ─── Algoritmos de validação ──────────────────────────────────────────────────

export function isValidCPF(cpf) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === +c[10];
}

export function isValidCNPJ(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (c, n) => {
    let s = 0, p = n - 7;
    for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c, 12) === +c[12] && calc(c, 13) === +c[13];
}

export function isValidEmail(email) {
  return email.trim().includes('@') && email.trim().length >= 3;
}

// RNM: 1 letra + 6 dígitos + traço + 1 letra ou dígito  ex: V123456-J
export function isValidRNM(rnm) {
  return /^[A-Za-z]\d{6}-[A-Za-z0-9]$/.test(rnm.trim().toUpperCase());
}

// CNH Estrangeiro: exatamente 11 dígitos numéricos
export function isValidCNHEstrangeiro(cnh) {
  return /^\d{11}$/.test(cnh.replace(/\D/g, ''));
}

export function isValidPhone(tel) {
  const d = tel.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}

// Nome: apenas letras (incluindo acentuadas), espaços, hífens e apóstrofos, mín. 2 chars
export function isValidName(name) {
  const t = name.trim();
  return t.length >= 2 && /^[A-Za-zÀ-ÿ\s\-']+$/.test(t);
}

// ─── Validação de formulário ──────────────────────────────────────────────────
/**
 * Valida um conjunto de regras e marca os campos com erro.
 * Cada regra: { id, value, rules: ['required','cpf','cnpj','email','phone'], label }
 * Retorna true se tudo válido.
 */
export function validateForm(rules) {
  let valid = true;
  for (const { id, value, rules: checks, label } of rules) {
    const v = (value ?? '').toString().trim();
    fieldOk(id); // limpa erro anterior

    if (checks.includes('required') && !v) {
      fieldError(id, `${label} é obrigatório.`);
      valid = false;
      continue;
    }
    if (!v) continue; // campos opcionais: se vazio não valida o resto

    if (checks.includes('cpf') && !isValidCPF(v)) {
      fieldError(id, 'CPF inválido.');
      valid = false; continue;
    }
    if (checks.includes('cnpj') && !isValidCNPJ(v)) {
      fieldError(id, 'CNPJ inválido.');
      valid = false; continue;
    }
    if (checks.includes('rnm') && !isValidRNM(v)) {
      fieldError(id, 'RNM inválido. Formato: A000000-A (ex: V123456-J).');
      valid = false; continue;
    }
    if ((checks.includes('cnh_estrangeiro') || checks.includes('cnh')) && !isValidCNHEstrangeiro(v)) {
      fieldError(id, 'CNH deve ter 11 dígitos numéricos.');
      valid = false; continue;
    }
    if (checks.includes('email') && !isValidEmail(v)) {
      fieldError(id, 'E-mail inválido.');
      valid = false; continue;
    }
    if (checks.includes('phone') && !isValidPhone(v)) {
      fieldError(id, 'Telefone deve ter DDD + número (10 ou 11 dígitos).');
      valid = false; continue;
    }
    if (checks.includes('positive')) {
      const n = parseFloat(v);
      if (isNaN(n) || n <= 0) {
        fieldError(id, `${label} deve ser maior que zero.`);
        valid = false; continue;
      }
    }
    if (checks.includes('int_positive')) {
      const n = parseInt(v);
      if (isNaN(n) || n <= 0) {
        fieldError(id, `${label} deve ser um número inteiro maior que zero.`);
        valid = false; continue;
      }
    }
  }
  return valid;
}

// ─── Realtime: valida campo ao sair do foco ───────────────────────────────────
/**
 * Registra validação on-blur para campos individuais.
 * Uso: bindBlur('f-email', 'email', 'E-mail', ['email'])
 */
export function bindBlur(id, label, checks) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', () => {
    validateForm([{ id, value: el.value, rules: checks, label }]);
  });
  el.addEventListener('input', () => {
    if (el.classList.contains('has-error')) fieldOk(id);
  });
}
