document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. Navigation & Header Effects
  // ==========================================================================
  const header = document.getElementById('site-header');
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  // Change header styling on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Mobile Menu Toggle
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', !isExpanded);
      menuToggle.classList.toggle('active');
      navLinks.classList.toggle('active');
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.classList.remove('active');
        navLinks.classList.remove('active');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('active') && !navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.classList.remove('active');
        navLinks.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // 2. Booking Form (Client Side) Date & Price Calculations
  // ==========================================================================
  const form = document.getElementById('reservation-form');
  const checkinInput = document.getElementById('checkin');
  const checkoutInput = document.getElementById('checkout');
  const adultsSelect = document.getElementById('guests-adults');
  const kidsSelect = document.getElementById('guests-kids');
  const nameInput = document.getElementById('guest-name');
  const phoneInput = document.getElementById('guest-phone');
  const emailInput = document.getElementById('guest-email');
  const commentsInput = document.getElementById('comments');

  const calcNightsSpan = document.getElementById('calc-nights');
  const calcTotalSpan = document.getElementById('calc-total');
  const calcDepositSpan = document.getElementById('calc-deposit');

  const PRICE_PER_NIGHT = 700000; // COP per night

  // Set minimum check-in date to today
  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];
  if (checkinInput) {
    checkinInput.min = todayISO;

    // Adjust minimum checkout date based on check-in
    checkinInput.addEventListener('change', () => {
      if (checkinInput.value) {
        const checkinDate = new Date(checkinInput.value);
        const minCheckoutDate = new Date(checkinDate);
        minCheckoutDate.setDate(minCheckoutDate.getDate() + 1);
        
        const minCheckoutISO = minCheckoutDate.toISOString().split('T')[0];
        checkoutInput.min = minCheckoutISO;

        if (checkoutInput.value && checkoutInput.value < minCheckoutISO) {
          checkoutInput.value = '';
        }
      }
      calculateNightsAndPrice();
    });
  }

  if (checkoutInput) {
    checkoutInput.addEventListener('change', () => {
      calculateNightsAndPrice();
    });
  }

  function calculateNightsAndPrice() {
    const checkinVal = checkinInput.value;
    const checkoutVal = checkoutInput.value;

    if (checkinVal && checkoutVal) {
      const checkinDate = new Date(checkinVal);
      const checkoutDate = new Date(checkoutVal);
      
      const diffTime = checkoutDate - checkinDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        calcNightsSpan.textContent = diffDays;
        
        const estimatedTotal = PRICE_PER_NIGHT * diffDays;
        const deposit = 100000; // Se separa con 100.000 COP fijo

        calcTotalSpan.textContent = `$${estimatedTotal.toLocaleString('es-CO')} COP`;
        if (calcDepositSpan) {
          calcDepositSpan.textContent = `$${deposit.toLocaleString('es-CO')} COP`;
        }
        return;
      }
    }
    
    calcNightsSpan.textContent = '0';
    calcTotalSpan.textContent = '$0 COP';
    if (calcDepositSpan) {
      calcDepositSpan.textContent = '$0 COP';
    }
  }

  if (adultsSelect) adultsSelect.addEventListener('change', calculateNightsAndPrice);
  if (kidsSelect) kidsSelect.addEventListener('change', calculateNightsAndPrice);

  // Form Validation helper
  const errorElements = {
    checkin: document.getElementById('error-checkin'),
    checkout: document.getElementById('error-checkout'),
    'guest-name': document.getElementById('error-guest-name'),
    'guest-phone': document.getElementById('error-guest-phone'),
    'guest-email': document.getElementById('error-guest-email')
  };

  function validateField(input) {
    const errorEl = errorElements[input.id];
    if (!errorEl) return true;

    if (!input.validity.valid) {
      input.classList.add('invalid');
      if (input.validity.valueMissing) {
        errorEl.textContent = 'Este campo es obligatorio.';
      } else if (input.validity.typeMismatch && input.type === 'email') {
        errorEl.textContent = 'Por favor, ingresa un correo válido.';
      } else if (input.validity.patternMismatch && input.id === 'guest-phone') {
        errorEl.textContent = 'Por favor, ingresa un número de teléfono válido (7 a 15 dígitos).';
      } else if (input.validity.tooShort) {
        errorEl.textContent = `Debe tener al menos ${input.minLength} caracteres.`;
      } else {
        errorEl.textContent = 'Entrada no válida.';
      }
      return false;
    } else {
      input.classList.remove('invalid');
      errorEl.textContent = '';
      return true;
    }
  }

  // Hook blur and input triggers
  [checkinInput, checkoutInput, nameInput, phoneInput, emailInput].forEach(input => {
    if (input) {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => {
        input.classList.remove('invalid');
        const errorEl = errorElements[input.id];
        if (errorEl) errorEl.textContent = '';
      });
    }
  });

  // ==========================================================================
  // 3. API Communication: Render occupied dates on public client
  // ==========================================================================
  // ==========================================================================
  // 3. API Communication & Dynamic Calendar Rendering
  // ==========================================================================
  const reservationsList = document.getElementById('reservations-list');
  const noReservationsMsg = document.getElementById('no-reservations-msg');
  const calendarGrid = document.getElementById('calendar-grid');
  const calendarMonthYear = document.getElementById('calendar-month-year');
  const btnPrevMonth = document.getElementById('btn-prev-month');
  const btnNextMonth = document.getElementById('btn-next-month');

  let publicReservations = [];
  let currentCalYear = new Date().getFullYear();
  let currentCalMonth = new Date().getMonth(); // 0-11

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  async function loadPublicReservations() {
    try {
      const response = await fetch('/api/reservations');
      if (!response.ok) throw new Error('Error al conectar con la API.');
      
      publicReservations = await response.json();
    } catch (err) {
      console.error('Error cargando reservas:', err);
      publicReservations = []; // Fallback to empty to allow rendering free calendar days
    } finally {
      renderCalendar(currentCalYear, currentCalMonth);
    }
  }

  function renderCalendar(year, month) {
    if (!calendarGrid || !calendarMonthYear) return;

    // Set Header Title: "Mes Año"
    calendarMonthYear.textContent = `${MONTH_NAMES[month]} ${year}`;

    calendarGrid.innerHTML = '';

    // First day of the month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    // We adjust Sunday to be 6 (so Mon=0, Tue=1, ..., Sat=5, Sun=6)
    const firstDayIndex = new Date(year, month, 1).getDay();
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Total days in month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // 1. Render empty cells before the first day
    for (let i = 0; i < adjustedFirstDay; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'calendar-day day-empty';
      calendarGrid.appendChild(emptyDiv);
    }

    // 2. Render each day of the month
    const todayObj = new Date();
    const todayDateStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= totalDays; day++) {
      const dayDiv = document.createElement('div');
      dayDiv.className = 'calendar-day day-free';
      dayDiv.textContent = day;

      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Highlight today
      if (dateStr === todayDateStr) {
        dayDiv.classList.add('day-today');
      }

      // Check if this date is occupied (checkin <= date < checkout)
      const dateVal = new Date(year, month, day);
      
      const overlappingRes = publicReservations.find(res => {
        const checkinParts = res.checkin.split('-');
        const checkoutParts = res.checkout.split('-');
        
        const resCheckin = new Date(parseInt(checkinParts[0], 10), parseInt(checkinParts[1], 10) - 1, parseInt(checkinParts[2], 10));
        const resCheckout = new Date(parseInt(checkoutParts[0], 10), parseInt(checkoutParts[1], 10) - 1, parseInt(checkoutParts[2], 10));
        
        return dateVal >= resCheckin && dateVal < resCheckout;
      });

      if (overlappingRes) {
        dayDiv.classList.remove('day-free');
        if (overlappingRes.status === 'Confirmada') {
          dayDiv.classList.add('day-confirmed');
        } else {
          dayDiv.classList.add('day-unconfirmed');
        }
      }

      // Let user click a free day to populate the check-in input automatically
      if (!overlappingRes) {
        dayDiv.addEventListener('click', () => {
          if (checkinInput) {
            checkinInput.value = dateStr;
            checkinInput.dispatchEvent(new Event('change'));
            checkinInput.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }

      calendarGrid.appendChild(dayDiv);
    }

    // 3. Render compact list of reservations for this specific month
    renderMonthlyReservationsList(year, month);
  }

  function renderMonthlyReservationsList(year, month) {
    if (!reservationsList || !noReservationsMsg) return;

    // Filter reservations that fall into this month
    const list = publicReservations.filter(res => {
      const checkinParts = res.checkin.split('-');
      const checkoutParts = res.checkout.split('-');
      
      const resCheckin = new Date(parseInt(checkinParts[0], 10), parseInt(checkinParts[1], 10) - 1, parseInt(checkinParts[2], 10));
      const resCheckout = new Date(parseInt(checkoutParts[0], 10), parseInt(checkoutParts[1], 10) - 1, parseInt(checkoutParts[2], 10));
      
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      return resCheckout >= monthStart && resCheckin <= monthEnd;
    });

    if (list.length === 0) {
      noReservationsMsg.classList.remove('hidden');
      reservationsList.classList.add('hidden');
      return;
    }

    noReservationsMsg.classList.add('hidden');
    reservationsList.classList.remove('hidden');
    reservationsList.innerHTML = '';

    // Sort chronological
    list.sort((a, b) => new Date(a.checkin) - new Date(b.checkin));

    list.forEach(res => {
      const item = document.createElement('div');
      item.className = 'reservation-item';
      
      const diffNights = Math.ceil((new Date(res.checkout) - new Date(res.checkin)) / (1000 * 60 * 60 * 24));
      const badgeClass = res.status === 'Confirmada' ? 'badge-confirmed' : 'badge-unconfirmed';

      item.innerHTML = `
        <div class="res-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <span class="res-name" style="font-size:0.9rem;">Ocupado / Reservado</span>
          <span class="badge ${badgeClass}" style="font-size:0.7rem; padding: 3px 8px;">${res.status}</span>
        </div>
        <div class="res-dates" style="font-size:0.85rem;">
          📅 ${formatDate(res.checkin)} &rarr; ${formatDate(res.checkout)} (${diffNights} ${diffNights === 1 ? 'noche' : 'noches'})
        </div>
      `;
      reservationsList.appendChild(item);
    });
  }

  // Navigation handlers
  if (btnPrevMonth && btnNextMonth) {
    btnPrevMonth.addEventListener('click', () => {
      currentCalMonth--;
      if (currentCalMonth < 0) {
        currentCalMonth = 11;
        currentCalYear--;
      }
      renderCalendar(currentCalYear, currentCalMonth);
    });

    btnNextMonth.addEventListener('click', () => {
      currentCalMonth++;
      if (currentCalMonth > 11) {
        currentCalMonth = 0;
        currentCalYear++;
      }
      renderCalendar(currentCalYear, currentCalMonth);
    });
  }

  // Format YYYY-MM-DD to DD/MM/YYYY
  function formatDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  // Initial public load
  if (calendarGrid) {
    loadPublicReservations();
  }

  // Client form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const inputs = [checkinInput, checkoutInput, nameInput, phoneInput, emailInput];
      let isFormValid = true;

      inputs.forEach(input => {
        if (input && !validateField(input)) {
          isFormValid = false;
        }
      });

      if (!isFormValid) {
        const firstInvalid = inputs.find(input => input && !input.validity.valid);
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const checkin = checkinInput.value;
      const checkout = checkoutInput.value;
      const adults = adultsSelect.value;
      const kids = kidsSelect.value;
      const name = nameInput.value;
      const phone = phoneInput.value;
      const email = emailInput.value;
      const comments = commentsInput.value.trim();
      const totalValStr = calcTotalSpan.textContent;
      
      // Enforce max capacity of 15 guests
      const adultsNum = parseInt(adults, 10);
      const kidsNum = parseInt(kids || 0, 10);
      if (adultsNum + kidsNum > 15) {
        alert("La capacidad máxima de la finca es de 15 personas en total (adultos + niños). Por favor reduce el número de huéspedes.");
        return;
      }

      // Calculate deposit to secure (flat $100.000 COP)
      const depositValStr = '$100.000 COP';

      const checkinDate = new Date(checkin);
      const checkoutDate = new Date(checkout);
      const diffNights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));

      const submitBtn = document.getElementById('btn-submit-booking');
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Procesando reserva...';

      try {
        // Send to SQLite Database via POST API
        const res = await fetch('/api/reservations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            checkin,
            checkout,
            adults,
            kids,
            name,
            phone,
            email,
            comments,
            total: totalValStr
          })
        });

        if (!res.ok) throw new Error('Error al registrar en el servidor.');

        // Refresh list
        loadPublicReservations();

        // Redirect to WhatsApp
        const whatsAppNumber = '573174252048';
        const message = `Hola Finca Calima Villa Melissa. Me gustaría realizar una reserva con los siguientes detalles:

*Nombre:* ${name}
*Teléfono:* ${phone}
*Correo:* ${email}
*Entrada (Check-In):* ${formatDate(checkin)}
*Salida (Check-Out):* ${formatDate(checkout)}
*Noches:* ${diffNights}
*Huéspedes:* ${adults} Adultos${kids > 0 ? `, ${kids} Niños` : ''}
${comments ? `*Comentarios:* ${comments}\n` : ''}
*Total Estimado:* ${totalValStr}
*Anticipo para Separar:* ${depositValStr}

Para completar y confirmar la reserva, enviaré el abono de separación de $100.000 COP por aquí. ¡Muchas gracias!`;

        const encodedMessage = encodeURIComponent(message);
        const whatsAppURL = `https://api.whatsapp.com/send?phone=${whatsAppNumber}&text=${encodedMessage}`;

        submitBtn.innerHTML = 'Redireccionando a WhatsApp...';
        
        setTimeout(() => {
          window.open(whatsAppURL, '_blank');
          form.reset();
          calculateNightsAndPrice();
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            Confirmar Reserva por WhatsApp
          `;
        }, 1000);

      } catch (err) {
        alert('Hubo un problema al guardar tu reserva: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Confirmar Reserva por WhatsApp';
      }
    });
  }

  // ==========================================================================
  // 4. Admin Panel Logic (Authentication, Dashboard, and CRUD Operations)
  // ==========================================================================
  const navAdminBtn = document.getElementById('nav-admin-btn');
  const mainContent = document.getElementById('main-content');
  const heroSection = document.querySelector('.hero-section');
  const adminPanel = document.getElementById('admin-panel');
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const adminPasswordInput = document.getElementById('admin-password');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const loginModalClose = document.getElementById('login-modal-close');

  const adminTableBody = document.getElementById('admin-table-body');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  const adminCreateBtn = document.getElementById('admin-create-btn');

  // Stats Elements
  const statTotal = document.getElementById('stat-total');
  const statPending = document.getElementById('stat-pending');
  const statConfirmed = document.getElementById('stat-confirmed');
  const statIncome = document.getElementById('stat-income');

  // Editor Modal elements
  const editorModal = document.getElementById('editor-modal');
  const editorForm = document.getElementById('editor-form');
  const editorModalClose = document.getElementById('editor-modal-close');
  const editorModalTitle = document.getElementById('editor-modal-title');
  const editorResId = document.getElementById('editor-res-id');
  const editorCheckin = document.getElementById('editor-checkin');
  const editorCheckout = document.getElementById('editor-checkout');
  const editorAdults = document.getElementById('editor-adults');
  const editorKids = document.getElementById('editor-kids');
  const editorName = document.getElementById('editor-name');
  const editorPhone = document.getElementById('editor-phone');
  const editorEmail = document.getElementById('editor-email');
  const editorComments = document.getElementById('editor-comments');
  const editorTotal = document.getElementById('editor-total');
  const editorStatus = document.getElementById('editor-status');

  let activeAdminToken = sessionStorage.getItem('admin_token') || null;

  // Initial check: if already logged in, show admin panel
  if (activeAdminToken) {
    enterAdminMode();
  }

  // Click on "Admin" link
  navAdminBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (activeAdminToken) {
      exitAdminMode();
    } else {
      loginModal.classList.remove('hidden');
      adminPasswordInput.focus();
    }
  });

  // Close Login Modal
  loginModalClose.addEventListener('click', () => {
    loginModal.classList.add('hidden');
    loginErrorMsg.textContent = '';
    loginForm.reset();
  });

  // Handle Login submission
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = adminPasswordInput.value;

    if (pw === 'admin123') { // Simple password matching
      activeAdminToken = pw;
      sessionStorage.setItem('admin_token', pw);
      loginModal.classList.add('hidden');
      loginForm.reset();
      loginErrorMsg.textContent = '';
      enterAdminMode();
    } else {
      loginErrorMsg.textContent = 'Contraseña incorrecta. Inténtalo de nuevo.';
      adminPasswordInput.value = '';
      adminPasswordInput.focus();
    }
  });

  function enterAdminMode() {
    mainContent.classList.add('hidden');
    heroSection.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    navAdminBtn.textContent = 'Salir Admin';
    navAdminBtn.classList.add('active');
    loadAdminReservations();
  }

  function exitAdminMode() {
    activeAdminToken = null;
    sessionStorage.removeItem('admin_token');
    mainContent.classList.remove('hidden');
    heroSection.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    navAdminBtn.textContent = 'Admin';
    navAdminBtn.classList.remove('active');
    // Refresh public occupied dates
    loadPublicReservations();
  }

  adminLogoutBtn.addEventListener('click', exitAdminMode);

  // Load reservations for Admin
  async function loadAdminReservations() {
    try {
      const res = await fetch(`/api/reservations?admin_token=${activeAdminToken}`);
      if (!res.ok) {
        if (res.status === 401) {
          alert('Tu sesión de administrador ha expirado.');
          exitAdminMode();
          return;
        }
        throw new Error('Error al descargar base de datos de reservas.');
      }
      const data = await res.json();
      renderAdminTable(data);
      updateAdminStats(data);
    } catch (err) {
      console.error(err);
      adminTableBody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">${err.message}</td></tr>`;
    }
  }

  function renderAdminTable(list) {
    adminTableBody.innerHTML = '';
    if (list.length === 0) {
      adminTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">No hay reservas en la base de datos.</td></tr>`;
      return;
    }

    list.forEach(res => {
      const checkinDate = new Date(res.checkin);
      const checkoutDate = new Date(res.checkout);
      const diffNights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
      
      const badgeClass = res.status === 'Confirmada' ? 'badge-confirmed' : (res.status === 'Cancelada' ? 'badge-cancelled' : 'badge-unconfirmed');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${res.id}</strong></td>
        <td>${escapeHTML(res.name)}</td>
        <td>
          <div style="font-size: 0.85rem; line-height: 1.3;">
            📞 <a href="tel:${res.phone}">${res.phone}</a><br>
            ✉️ <a href="mailto:${res.email}">${res.email}</a>
          </div>
        </td>
        <td>${formatDate(res.checkin)}</td>
        <td>${formatDate(res.checkout)}</td>
        <td style="text-align: center;">${diffNights}</td>
        <td>👥 ${res.adults} Ad. ${res.kids > 0 ? `, ${res.kids} Ni.` : ''}</td>
        <td><strong>${res.total}</strong></td>
        <td><span class="badge ${badgeClass}">${res.status}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon edit-btn" data-id="${res.id}" title="Editar Reserva">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="btn-icon delete delete-btn" data-id="${res.id}" title="Eliminar de BD">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </td>
      `;
      adminTableBody.appendChild(tr);
    });

    // Wire up actions
    adminTableBody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditorModal(id, list);
      });
    });

    adminTableBody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteReservationFromDB(id);
      });
    });
  }

  function updateAdminStats(list) {
    statTotal.textContent = list.length;
    statPending.textContent = list.filter(r => r.status === 'Sin Confirmar').length;
    statConfirmed.textContent = list.filter(r => r.status === 'Confirmada').length;
    
    // Calculate total income (Confirmed only)
    let totalIncome = 0;
    list.forEach(res => {
      if (res.status === 'Confirmada') {
        // Strip non-numeric chars from COP total
        const num = parseInt(res.total.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num)) totalIncome += num;
      }
    });

    statIncome.textContent = `$${totalIncome.toLocaleString('es-CO')} COP`;
  }

  // DELETE operation
  async function deleteReservationFromDB(id) {
    if (confirm(`¿Estás completamente seguro de que deseas ELIMINAR la reserva #${id} de la base de datos? Esta acción es irreversible.`)) {
      try {
        const res = await fetch(`/api/reservations/${id}`, {
          method: 'DELETE',
          headers: {
            'x-admin-token': activeAdminToken
          }
        });

        if (!res.ok) throw new Error('Error al procesar la eliminación.');
        
        loadAdminReservations();
      } catch (err) {
        alert('Error al borrar la reserva: ' + err.message);
      }
    }
  }

  // Edit / Add Modal triggers
  function openEditorModal(id = null, list = []) {
    editorForm.reset();
    
    if (id) {
      // Edit Mode
      editorModalTitle.textContent = `Editar Reserva #${id}`;
      editorResId.value = id;
      
      const res = list.find(r => r.id.toString() === id.toString());
      if (res) {
        editorCheckin.value = res.checkin;
        editorCheckout.value = res.checkout;
        editorAdults.value = res.adults;
        editorKids.value = res.kids;
        editorName.value = res.name;
        editorPhone.value = res.phone;
        editorEmail.value = res.email;
        editorComments.value = res.comments;
        editorTotal.value = res.total;
        editorStatus.value = res.status;
      }
    } else {
      // Add Mode
      editorModalTitle.textContent = 'Crear Reserva Manual';
      editorResId.value = '';
      editorStatus.value = 'Confirmada'; // Default manual booking status
      editorAdults.value = 2;
      editorKids.value = 0;
      editorTotal.value = '$600.000 COP';
      
      // Default to today and tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      editorCheckin.value = new Date().toISOString().split('T')[0];
      editorCheckout.value = tomorrow.toISOString().split('T')[0];
    }
    
    editorModal.classList.remove('hidden');
  }

  // Close Editor Modal
  editorModalClose.addEventListener('click', () => {
    editorModal.classList.add('hidden');
  });

  // Admin click "Nueva Reserva Manual"
  adminCreateBtn.addEventListener('click', () => {
    openEditorModal();
  });

  // Editor Form Submission (API PUT or API POST)
  editorForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = editorResId.value;
    const checkin = editorCheckin.value;
    const checkout = editorCheckout.value;
    const adults = editorAdults.value;
    const kids = editorKids.value;
    const name = editorName.value;
    const phone = editorPhone.value;
    const email = editorEmail.value;
    const comments = editorComments.value;
    const total = editorTotal.value;
    const status = editorStatus.value;

    if (!checkin || !checkout || !adults || !name || !phone || !email || !total) {
      alert('Por favor completa todos los campos requeridos.');
      return;
    }

    const payload = {
      checkin, checkout, adults, kids, name, phone, email, comments, total, status
    };

    try {
      let response;
      if (id) {
        // Edit Existing (PUT)
        response = await fetch(`/api/reservations/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': activeAdminToken
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create New Manual (POST)
        response = await fetch('/api/reservations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al guardar los cambios en el servidor.');
      }

      editorModal.classList.add('hidden');
      loadAdminReservations();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Escape HTML helper
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});
