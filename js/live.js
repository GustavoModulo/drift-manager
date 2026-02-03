/* ============================================================
   ARQUIVO: live.js
   FUNÇÃO: Controle da Tela do Público (TV)
   DESCRIÇÃO: Atualiza em tempo real sem necessidade de refresh
   AUTOR: Gustavo Henrique Modulo
   ============================================================ */

const SUPABASE_URL = 'https://tskokahvusjekwlzhpgc.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRza29rYWh2dXNqZWt3bHpocGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0Mzc0MzIsImV4cCI6MjA4NTAxMzQzMn0.hCz7sa446cAop0TvJeN-bxvABQaMZq-qANKyq5Swr4E';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Carregamento inicial de todas as views
loadQualifyData();
loadBracketData();
loadCurrentBattle();
loadSeasonRanking();

// --- ATUALIZAÇÃO EM TEMPO REAL (REALTIME) ---
// O Supabase "ouve" mudanças no banco e dispara estas funções
sb.channel('public_updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => { 
        // Se mudou algo nos pilotos (nota, nome), atualiza ranking e qualify
        loadQualifyData(); 
        loadSeasonRanking(); 
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battles' }, () => { 
        // Se mudou algo nas batalhas (vencedor, nova fase), atualiza chaves e batalha atual
        loadBracketData(); 
        loadCurrentBattle(); 
    })
    .subscribe();

// --- FUNÇÕES DE EXPORTAÇÃO (PRINT) ---
// Permite salvar a tela atual como imagem PNG
window.showToast = function(msg, type='info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>📸</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

window.captureElement = function(elementId, fileName) {
    const el = document.getElementById(elementId);
    showToast('Gerando imagem...', 'info');
    // Html2Canvas renderiza o elemento DOM em um canvas invisível
    html2canvas(el, { backgroundColor: "#050505", scale: 2 }).then(canvas => {
        const link = document.createElement("a");
        link.download = `${fileName}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('Imagem salva!', 'success');
    });
}

window.captureActiveView = function(viewName) {
    // Captura apenas a categoria visível (Pro ou Light)
    let cat = (typeof activeCat !== 'undefined') ? activeCat : 'pro';
    let targetId = `${viewName}-${cat}-container`;
    captureElement(targetId, `live_${viewName}_${cat}`);
}

// --- VIEW 1: CLASSIFICAÇÃO (QUALIFY) ---
async function loadQualifyData() {
    const { data: drivers } = await sb.from('drivers').select('*').order('best_score', { ascending: false });
    if (drivers) {
        // Ordenação com desempate
        drivers.sort((a, b) => {
            let diff = (b.best_score || 0) - (a.best_score || 0);
            if (diff === 0) return (Math.min(b.run1||0, b.run2||0) - Math.min(a.run1||0, a.run2||0)); 
            return diff;
        });
        
        const pro = drivers.filter(d => d.category === 'PRO' && d.best_score > 0);
        const light = drivers.filter(d => d.category === 'LIGHT' && d.best_score > 0);
        
        // Cores personalizadas por categoria
        renderCompactList('liveQualifyPro', pro, '#FFE600');
        renderCompactList('liveQualifyLight', light, '#00C3FF');
    }
}

function renderCompactList(elementId, list, highlightColor) {
    const container = document.getElementById(elementId);
    if (list.length === 0) { container.innerHTML = '<div class="empty-msg">PISTA LIMPA</div>'; return; }
    
    container.innerHTML = list.map((d, i) => {
        // Classes para destacar o top 3 (Podium)
        let podiumClass = '';
        if(i === 0) podiumClass = 'podium-1';
        else if(i === 1) podiumClass = 'podium-2';
        else if(i === 2) podiumClass = 'podium-3';
        
        return `<div class="compact-row ${podiumClass}"><span class="c-pos">#${i+1}</span><div class="c-info"><span class="c-name">${d.name}</span><span class="c-car">${d.car || ''}</span></div><div class="c-scores"><span class="c-best" style="color:${highlightColor}">${d.best_score}</span></div></div>`;
    }).join('');
}

// --- VIEW 2: RANKING DA TEMPORADA ---
async function loadSeasonRanking() {
    const { data: allDrivers } = await sb.from('drivers').select('*').order('season_points', { ascending: false });
    if (!allDrivers) return;
    const pro = allDrivers.filter(d => d.category === 'PRO' && d.season_points > 0);
    const light = allDrivers.filter(d => d.category === 'LIGHT' && d.season_points > 0);
    renderRankingTable('liveRankingPro', pro, '#FFE600');
    renderRankingTable('liveRankingLight', light, '#00C3FF');
}

function renderRankingTable(elementId, list, color) {
    const container = document.getElementById(elementId);
    if (list.length === 0) { container.innerHTML = '<div class="empty-msg">SEM PONTOS</div>'; return; }
    container.innerHTML = list.map((d, i) => {
        let podiumClass = '';
        if(i === 0) podiumClass = 'podium-1';
        else if(i === 1) podiumClass = 'podium-2';
        else if(i === 2) podiumClass = 'podium-3';
        return `<div class="rank-row ${podiumClass}"><span class="rank-pos">#${i+1}</span><span class="rank-name">${d.name}</span><span class="rank-pts" style="color:${color}">${d.season_points}</span></div>`;
    }).join('');
}

// --- VIEW 3: CHAVEAMENTO (BRACKET) ---
async function loadBracketData() {
    const { data: allBattles } = await sb.from('battles').select(`*, d1:driver1_id(name), d2:driver2_id(name)`).order('id', { ascending: true }); 
    if (!allBattles) return;
    renderBracket('liveBracketPro', allBattles.filter(b => b.category === 'PRO'), '#FFE600');
    renderBracket('liveBracketLight', allBattles.filter(b => b.category === 'LIGHT'), '#00C3FF');
}

function renderBracket(elementId, battles, color) {
    const container = document.getElementById(elementId);
    if (battles.length === 0) { container.innerHTML = '<div class="empty-msg">AGUARDANDO CHAVES...</div>'; return; }
    
    // Organiza batalhas por Round
    const rounds = {};
    battles.forEach(b => { if (!rounds[b.round_name]) rounds[b.round_name] = []; rounds[b.round_name].push(b); });
    
    const displayOrder = ['TOP 32', 'TOP 16', 'TOP 8', 'SEMI', 'FINAL'];
    let html = '<div class="bracket-container">';
    
    displayOrder.forEach(rName => {
        if (rounds[rName] && rounds[rName].length > 0) {
            html += `<div class="round-column"><div class="round-title" style="color:${color}">${rName}</div>`;
            rounds[rName].forEach(m => {
                let p1 = m.d1 ? m.d1.name : '...'; let p2 = m.d2 ? m.d2.name : '...'; let w = m.winner_id;
                if (m.driver1_id && !m.driver2_id) { p2 = 'BYE'; }
                
                // Estilização condicional (vencedor ou pendente)
                let activeClass = (m.status === 'pending') ? `border-color:${color};` : '';
                let winStyle = `color:${color}; font-weight:bold;`;
                
                html += `<div class="match-card" style="${activeClass}"><div class="match-player" style="${w === m.driver1_id ? winStyle : ''}"><span>${p1}</span></div><div class="match-player" style="${w === m.driver2_id ? winStyle : ''}"><span>${p2}</span></div></div>`;
            });
            html += `</div>`;
        }
    });
    html += '</div>';
    container.innerHTML = html;
}

// --- VIEW 4: BATALHA ATUAL ---
async function loadCurrentBattle() {
    const viewNow = document.getElementById('view-now-content');
    if (!viewNow) return;
    
    // Verifica se há um vencedor final
    const { data: finalBattle } = await sb.from('battles').select(`*, d1:driver1_id(name), d2:driver2_id(name)`).eq('round_name', 'FINAL').eq('status', 'finished').limit(1);
    if (finalBattle && finalBattle.length > 0) {
        const fb = finalBattle[0];
        let winnerName = (fb.winner_id === fb.driver1_id) ? fb.d1.name : fb.d2.name;
        let catColor = fb.category === 'PRO' ? '#FFE600' : '#00C3FF';
        viewNow.innerHTML = `<div class="champion-box" style="margin-top:20px;"><div style="font-size:1.2rem; color:#888; margin-bottom:10px;">VENCEDOR DA ETAPA ${fb.category}</div><div style="font-size:3.5rem; color:${catColor}; font-family:var(--font-display); font-style:italic; text-transform:uppercase;">${winnerName}</div></div>`;
        return;
    }
    
    // Se não, busca a próxima batalha pendente
    const { data: battles } = await sb.from('battles').select(`*, d1:driver1_id(name, car), d2:driver2_id(name, car)`).eq('status', 'pending').order('id', { ascending: true }).limit(1);
    if (battles && battles.length > 0) {
        const b = battles[0];
        let catColor = b.category === 'PRO' ? '#FFE600' : '#00C3FF';
        let omtLabel = b.omt_count > 0 ? `<div style="color:${catColor}; font-size:1.5rem; font-weight:bold; margin-bottom:10px;">OMT ${b.omt_count}</div>` : '';
        viewNow.innerHTML = `<h2 style="text-align:center; margin-bottom:15px; font-size:1.1rem; color:#666;"><span style="color:${catColor}; font-weight:bold;">${b.category}</span> - ${b.round_name} #${b.match_id}</h2>${omtLabel}<div class="battle-now-display"><div class="big-card" style="border-color:${catColor}"><span class="big-name">${b.d1 ? b.d1.name : 'BYE'}</span><span class="big-car">${b.d1 ? b.d1.car : '-'}</span></div><div class="big-vs">VS</div><div class="big-card" style="border-color:${catColor}"><span class="big-name">${b.d2 ? b.d2.name : 'BYE'}</span><span class="big-car">${b.d2 ? b.d2.car : '-'}</span></div></div>`;
    } else {
        viewNow.innerHTML = `<div class="empty-msg">AGUARDANDO INÍCIO...</div>`;
    }
}