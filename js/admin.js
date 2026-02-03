/* ============================================================
   ARQUIVO: admin.js
   FUNÇÃO: Lógica do Painel Administrativo
   AUTOR: Gustavo Henrique Modulo
   ============================================================ */

// --- 1. CONFIGURAÇÃO DO BANCO DE DADOS (SUPABASE) ---
// Substitua estas chaves pelas do seu projeto no Supabase
const SUPABASE_URL = 'https://tskokahvusjekwlzhpgc.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRza29rYWh2dXNqZWt3bHpocGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0Mzc0MzIsImV4cCI6MjA4NTAxMzQzMn0.hCz7sa446cAop0TvJeN-bxvABQaMZq-qANKyq5Swr4E';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variáveis de Estado Global
let currentCategory = 'PRO';        // Categoria ativa na Etapa Atual
let currentSeasonCategory = 'PRO';  // Categoria ativa no Ranking Geral
let driversData = [];               // Cache local dos pilotos
let currentPhaseName = '';          // Fase atual das batalhas (Top 32, 16, etc)

// Tabela de Pontos (Drift Padrão: 1º=25, 2º=18...)
const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const QUALIFY_BONUS_P1 = 5; // Bônus para o P1 do Qualify

// Referências aos elementos HTML (Cache de Seletores)
const displayTotal = document.getElementById('displayTotal');
const listDiv = document.getElementById('driverListDisplay');
const battlesDiv = document.getElementById('battlesList');
const btnAdvance = document.getElementById('btnAdvance');
const bracketControls = document.getElementById('bracketControls');
const phaseLabel = document.getElementById('phaseIndicator');
const championDisplay = document.getElementById('championDisplay');

// --- 2. SISTEMA DE MODAL (POP-UP) ---
// Função genérica para abrir modais de confirmação
let modalCallback = null;
function showModal(title, text, type, callback) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalText').innerText = text;
    document.getElementById('customModal').style.display = 'flex';
    
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const input = document.getElementById('modalInput');
    
    input.style.display = 'none'; 
    input.value = '';
    confirmBtn.className = 'modal-btn confirm';
    
    // Se for ação perigosa (deletar), botão fica vermelho
    if (type === 'danger' || type === 'input-danger') {
        confirmBtn.className = 'modal-btn danger';
    }
    confirmBtn.innerText = 'CONFIRMAR';

    // Se exigir digitação de segurança
    if (type === 'input-danger') { 
        input.style.display = 'block'; 
        input.focus(); 
    }

    // Define o que acontece ao confirmar
    modalCallback = () => {
        if (type === 'input-danger' && input.value.toUpperCase() !== 'DELETAR') {
            showToast('Código incorreto!', 'error'); 
            return;
        }
        callback(); 
        closeModal();
    };
}

// Fecha o modal
window.closeModal = function() { 
    document.getElementById('customModal').style.display = 'none'; 
    modalCallback = null; 
}

// Vincula o botão de confirmar do modal
document.getElementById('modalConfirmBtn').onclick = () => { 
    if (modalCallback) modalCallback(); 
};

// --- 3. SISTEMA DE TOAST (NOTIFICAÇÕES) ---
// Exibe mensagens flutuantes (Sucesso/Erro) no canto da tela
window.showToast = function(msg, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    
    // Remove automaticamente após 3 segundos
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

// --- 4. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => { 
    document.getElementById('customModal').style.display = 'none'; 
    fetchDrivers(); // Carrega pilotos
    fetchBattles(); // Carrega batalhas
    document.getElementById('btnAdd').addEventListener('click', submitRun); // Botão lançar nota
});

// --- 5. NAVEGAÇÃO E CONTROLES ---
window.switchMainView = function(view) {
    document.getElementById('view-stage').style.display = view === 'stage' ? 'block' : 'none';
    document.getElementById('view-season').style.display = view === 'season' ? 'block' : 'none';
    document.getElementById('navStage').classList.toggle('active', view === 'stage');
    document.getElementById('navSeason').classList.toggle('active', view === 'season');
    if (view === 'season') fetchSeasonRanking();
}

window.setCategory = function(cat) {
    currentCategory = cat;
    // Atualiza estilo dos botões
    document.getElementById('btnPro').className = 'tab-btn';
    document.getElementById('btnLight').className = 'tab-btn';
    
    if(cat === 'PRO') document.getElementById('btnPro').classList.add('active-pro');
    else document.getElementById('btnLight').classList.add('active-light');
    
    // Recarrega dados para a nova categoria
    fetchDrivers(); 
    fetchBattles();
}

window.setSeasonCategory = function(cat) {
    currentSeasonCategory = cat;
    document.getElementById('btnSeasonPro').className = 'tab-btn';
    document.getElementById('btnSeasonLight').className = 'tab-btn';
    document.getElementById('season-pro-content').style.display = 'none';
    document.getElementById('season-light-content').style.display = 'none';
    
    if(cat === 'PRO') {
        document.getElementById('btnSeasonPro').classList.add('active-pro');
        document.getElementById('season-pro-content').style.display = 'block';
    } else {
        document.getElementById('btnSeasonLight').classList.add('active-light');
        document.getElementById('season-light-content').style.display = 'block';
    }
}

// --- 6. CÁLCULO DE NOTAS (AUTOMÁTICO) ---
window.calcTotal = function() {
    let l = parseFloat(document.getElementById('scoreLine').value) || 0;
    let a = parseFloat(document.getElementById('scoreAngle').value) || 0;
    let s = parseFloat(document.getElementById('scoreStyle').value) || 0;
    
    // Travas de segurança (Notas máximas)
    if(l>30) l=30; if(a>30) a=30; if(s>40) s=40;
    
    // Atualiza o display grande
    displayTotal.innerText = (l + a + s).toFixed(1);
    return l + a + s;
}

// --- 7. GERENCIAMENTO DE PILOTOS (CRUD) ---
async function fetchDrivers() {
    listDiv.innerHTML = '<p class="empty-msg">Carregando...</p>';
    const { data, error } = await sb.from('drivers')
        .select('*')
        .eq('category', currentCategory)
        .order('best_score', { ascending: false }); // Ordena pela melhor nota
    
    if (!error) { 
        driversData = data;
        // Lógica de Desempate (Tie-breaker)
        driversData.sort((a, b) => {
            let diff = (b.best_score || 0) - (a.best_score || 0);
            if (diff === 0) {
                // Se empatar na melhor, usa a segunda melhor nota
                return (Math.min(b.run1||0, b.run2||0) - Math.min(a.run1||0, a.run2||0)); 
            }
            return diff;
        });
        renderList(); 
    }
}

async function submitRun() {
    const name = document.getElementById('driverName').value.trim().toUpperCase();
    const car = document.getElementById('driverCar').value.trim().toUpperCase(); 
    const totalScore = calcTotal();
    
    if (!name) { showToast('Nome obrigatório!', 'error'); return; }
    
    await fetchDrivers(); // Garante que temos dados frescos para verificar duplicatas
    const existing = driversData.find(d => d.name.toUpperCase() === name);
    
    const updateData = { 
        name: name, 
        car: car, 
        category: currentCategory, 
        run1: totalScore, 
        best_score: totalScore 
    };

    if (existing) {
        // Se piloto existe, verifica se é a 2ª volta
        let isRun2 = (existing.run1 !== null && existing.run1 > 0);
        let finalBest = Math.max(existing.best_score || 0, totalScore);
        
        let dynamicUpdate = !isRun2 
            ? { ...updateData } // Se for a 1ª volta, atualiza tudo
            : { run2: totalScore, best_score: finalBest }; // Se for a 2ª, atualiza só Run2 e Best
            
        await sb.from('drivers').update(dynamicUpdate).eq('id', existing.id);
        showToast('Nota Atualizada!', 'success');
    } else {
        // Novo piloto
        await sb.from('drivers').insert(updateData);
        showToast('Novo Piloto!', 'success');
    }
    
    // Limpa o formulário
    document.getElementById('driverName').value = ''; 
    document.getElementById('driverCar').value = ''; 
    displayTotal.innerText = '0';
    document.getElementById('scoreLine').value = '';
    document.getElementById('scoreAngle').value = '';
    document.getElementById('scoreStyle').value = '';
    
    fetchDrivers();
}

function renderList() {
    const activeDrivers = driversData.filter(d => d.best_score > 0);
    if (activeDrivers.length === 0) { 
        listDiv.innerHTML = '<div class="empty-msg">Aguardando pilotos...</div>'; 
        return; 
    }
    
    listDiv.innerHTML = activeDrivers.map((d, i) => {
        // Renderiza cada linha de piloto com notas e botão de deletar
        return `
        <div class="driver-item">
            <span class="pos-badge">#${i+1}</span>
            <div style="flex:1;">
                <span class="driver-name">${d.name}</span>
                <span class="driver-car-label">${d.car || 'CARRO NÃO INF.'}</span>
            </div>
            <div class="telemetry-grid">
                <div class="run-box ${d.run1 === d.best_score ? 'best' : ''}">${d.run1 || '-'}</div>
                <div class="run-box ${d.run2 === d.best_score ? 'best' : ''}">${d.run2 || '-'}</div>
            </div>
            <button class="btn-icon delete" onclick="deleteDriver(${d.id})">🗑️</button>
        </div>`;
    }).join('');
}

window.deleteDriver = function(id) {
    showModal('APAGAR PILOTO?', 'Isso removerá o piloto permanentemente.', 'danger', async () => {
        await sb.from('drivers').delete().eq('id', id); 
        showToast('Removido.', 'info'); 
        fetchDrivers();
    });
}

// --- 8. EXPORTAÇÃO DE IMAGEM (HTML2CANVAS) ---
window.captureElement = function(elementId, fileName) {
    const el = document.getElementById(elementId);
    showToast('Gerando imagem...', 'info');
    html2canvas(el, { backgroundColor: "#111111", scale: 2 }).then(canvas => {
        const link = document.createElement("a");
        link.download = `${fileName}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('Imagem salva!', 'success');
    });
}

window.captureActiveRanking = function() {
    let target = currentSeasonCategory === 'PRO' ? 'season-pro-content' : 'season-light-content';
    captureElement(target, `ranking_${currentSeasonCategory}`);
}

// --- 9. SISTEMA DE CHAVEAMENTO (BRACKETS) ---

async function checkAndAutoAdvance(phaseName) {
    // Verifica se todos da fase atual já correram
    const { data: battles } = await sb.from('battles')
        .select('*')
        .eq('category', currentCategory)
        .eq('round_name', phaseName);
        
    if (!battles || battles.length === 0) { 
        fetchBattles(); 
        return; 
    }
    
    const pendingBattles = battles.filter(b => b.status === 'pending');
    
    // Se não há pendentes e não é final, gera a próxima fase automaticamente
    if (pendingBattles.length === 0 && phaseName !== 'FINAL') {
        showToast(`Fase ${phaseName} concluída! Gerando próxima...`, 'info');
        await advancePhaseInternal(true); 
    } else { 
        fetchBattles(); 
    }
}

async function handleAutoBracket() {
    await fetchDrivers();
    
    // Segurança: Verifica se já existem batalhas
    const { count } = await sb.from('battles')
        .select('*', { count: 'exact', head: true })
        .eq('category', currentCategory);
        
    const drivers = driversData.filter(d => d.best_score > 0);
    
    if (drivers.length < 2) { 
        showToast('ERRO: Precisa de pelo menos 2 pilotos!', 'error'); 
        return; 
    }

    const startBracket = async () => {
        // Define o tamanho da chave (Top 32 ou Top 16)
        let size = drivers.length > 16 ? 32 : 16;
        
        showModal(`INICIAR TOP ${size}?`, `${drivers.length} pilotos qualificados.`, 'normal', async () => {
            // Seeds (Pares fixos de Drift: 1vs32, 2vs31, etc.)
            let seeds32 = [[1,32],[16,17],[9,24],[8,25],[4,29],[13,20],[5,28],[12,21],[2,31],[15,18],[7,26],[10,23],[3,30],[14,19],[6,27],[11,22]];
            let seeds16 = [[1,16],[8,9],[4,13],[5,12],[2,15],[7,10],[3,14],[6,11]];
            
            let seeds = size === 32 ? seeds32 : seeds16;
            const qualified = drivers.slice(0, size); // Pega apenas os Top X
            
            let matches = [];
            
            seeds.forEach((pair, index) => {
                let d1 = qualified[pair[0]-1]; // Piloto seed alta
                let d2 = qualified[pair[1]-1]; // Piloto seed baixa
                
                let p1_id = d1 ? d1.id : null;
                let p2_id = d2 ? d2.id : null;
                
                let winner_id = null;
                let status = 'pending';
                
                // Bye Run: Se não tem oponente, avança automático
                if (p1_id && !p2_id) { 
                    winner_id = p1_id; 
                    status = 'finished'; 
                }
                if (!p1_id && !p2_id) { 
                    status = 'finished'; 
                }

                matches.push({ 
                    match_id: index + 1, 
                    round_name: 'TOP ' + size, 
                    category: currentCategory, 
                    driver1_id: p1_id, 
                    driver2_id: p2_id, 
                    winner_id: winner_id, 
                    status: status 
                });
            });

            // Salva no banco em lote
            const { error } = await sb.from('battles').insert(matches);
            if (error) {
                showToast('Erro ao criar chaves: ' + error.message, 'error');
            } else {
                currentPhaseName = 'TOP ' + size;
                // Checa se houveram muitos Bye Runs para já avançar
                await checkAndAutoAdvance('TOP ' + size);
            }
        });
    };

    if (count > 0) { 
        showModal('JÁ EXISTE UM EVENTO', 'Digite DELETAR para reiniciar.', 'input-danger', async () => { 
            await sb.from('battles').delete().eq('category', currentCategory); 
            startBracket(); 
        }); 
    } else { 
        startBracket(); 
    }
}

async function fetchBattles() {
    battlesDiv.innerHTML = 'Carregando...';
    
    // Busca batalhas e faz join para pegar nomes dos pilotos
    const { data: allBattles } = await sb.from('battles')
        .select(`*, d1:driver1_id(name), d2:driver2_id(name)`)
        .eq('category', currentCategory)
        .order('id', { ascending: true });

    if (!allBattles || allBattles.length === 0) {
        battlesDiv.innerHTML = '<p class="empty-msg">Nenhuma batalha ativa.</p>';
        bracketControls.style.display = 'flex'; 
        btnAdvance.style.display = 'none'; 
        phaseLabel.innerText = ''; 
        championDisplay.style.display = 'none'; 
        return;
    }

    bracketControls.style.display = 'none';
    
    // Identifica fase atual
    let lastBattle = allBattles[allBattles.length - 1];
    currentPhaseName = lastBattle.round_name;
    phaseLabel.innerText = currentPhaseName;
    
    let currentRoundBattles = allBattles.filter(b => b.round_name === currentPhaseName);
    let allDone = currentRoundBattles.every(b => b.status === 'finished');

    // Se acabou a FINAL, mostra campeão
    if (currentPhaseName === 'FINAL' && allDone) {
        let finalBattle = currentRoundBattles[0];
        if (!finalBattle.winner_id) return; 
        
        let winnerName = (finalBattle.winner_id === finalBattle.driver1_id) ? finalBattle.d1.name : finalBattle.d2.name;
        
        battlesDiv.style.display = 'none';
        championDisplay.style.display = 'block';
        championDisplay.innerHTML = `
            <div class="champion-box">
                <div class="champion-title" style="color:#666; font-size:0.9rem;">VENCEDOR DA ETAPA</div>
                <div class="champion-name">${winnerName}</div>
                <button onclick="calculateAndFinishStage()" class="btn btn-season">SOMAR PONTOS E ENCERRAR ETAPA 🏆</button>
            </div>`;
        btnAdvance.style.display = 'none'; 
        return;
    } else {
        battlesDiv.style.display = 'block'; 
        championDisplay.style.display = 'none';
    }

    // Renderiza lista de batalhas
    battlesDiv.innerHTML = currentRoundBattles.map(b => {
        if (!b.driver1_id && !b.driver2_id) return ''; 
        
        let p1Name = b.d1 ? b.d1.name : 'BYE'; 
        let p2Name = b.d2 ? b.d2.name : 'BYE';
        
        let isFinished = b.status === 'finished';
        let p1Class = b.winner_id === b.driver1_id ? 'winner-selected' : '';
        let p2Class = b.winner_id === b.driver2_id ? 'winner-selected' : '';
        
        let isByeRun = (b.driver1_id && !b.driver2_id) || (!b.driver1_id && b.driver2_id);
        let btnDisabled = (isFinished || isByeRun) ? 'disabled' : '';
        
        let statusLabel = isFinished ? 'FINALIZADO' : 'EM ANDAMENTO'; 
        if (isByeRun) statusLabel = 'BYE RUN (AUTO)';

        return `
        <div class="admin-battle-item ${isFinished ? 'finished' : ''}" style="${isFinished ? 'border-left-color:var(--primary);' : ''}">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#666;">
                <span>Batalha #${b.match_id}</span>
                <span style="${isByeRun ? 'color:var(--primary); font-weight:bold;' : ''}">${statusLabel}</span>
            </div>
            <div class="battle-matchup-display">
                <span>${p1Name}</span> <span class="vs">X</span> <span>${p2Name}</span>
            </div>
            <div class="battle-actions-row" style="display:flex; gap:5px;">
                <button class="btn-decision p1 ${p1Class}" onclick="setWinner(${b.id}, ${b.driver1_id})" ${btnDisabled}>${p1Name}</button>
                <button class="btn-decision omt" onclick="setOMT(${b.id}, ${b.omt_count})" ${btnDisabled}>OMT</button>
                <button class="btn-decision p2 ${p2Class}" onclick="setWinner(${b.id}, ${b.driver2_id})" ${btnDisabled}>${p2Name}</button>
            </div>
        </div>`;
    }).join('');

    if (allDone && currentPhaseName !== 'FINAL') { 
        btnAdvance.style.display = 'block'; 
        btnAdvance.innerText = `GERAR PRÓXIMA FASE`; 
    } else { 
        btnAdvance.style.display = 'none'; 
    }
}

window.advancePhase = function() { 
    showModal('AVANÇAR FASE?', 'Isso vai gerar os próximos confrontos.', 'normal', async () => { 
        await advancePhaseInternal(false); 
    }); 
}

async function advancePhaseInternal(isAuto) {
    // Pega as batalhas da fase atual para ver quem ganhou
    const { data: currentBattles } = await sb.from('battles')
        .select('*')
        .eq('category', currentCategory)
        .eq('round_name', currentPhaseName)
        .order('id', { ascending: true });

    let winners = []; 
    currentBattles.forEach(b => { 
        winners.push(b.winner_id); 
    });

    // Define nome da próxima fase
    let newName = '';
    if (currentPhaseName === 'TOP 32') newName = 'TOP 16';
    else if (currentPhaseName === 'TOP 16') newName = 'TOP 8';
    else if (currentPhaseName === 'TOP 8') newName = 'SEMI';
    else if (currentPhaseName === 'SEMI') newName = 'FINAL';

    if (newName === '') return;

    let newMatches = []; 
    let matchCounter = 1;

    // Cria batalhas agrupando vencedores (1º vs 2º, 3º vs 4º...)
    for (let i = 0; i < winners.length; i += 2) {
        let p1 = winners[i]; 
        let p2 = winners[i+1];
        
        let winner_id = null; 
        let status = 'pending';

        // Lógica de avanço se oponente não existe
        if (p1 && !p2) { winner_id = p1; status = 'finished'; }
        if (!p1 && p2) { winner_id = p2; status = 'finished'; }
        if (!p1 && !p2) { status = 'finished'; }

        newMatches.push({ 
            match_id: matchCounter++, 
            round_name: newName, 
            category: currentCategory, 
            driver1_id: p1, 
            driver2_id: p2, 
            winner_id: winner_id, 
            status: status 
        });
    }

    await sb.from('battles').insert(newMatches);
    currentPhaseName = newName;
    
    // Se a nova fase também for só Bye Runs, avança de novo recursivamente
    if (newName !== 'FINAL') { 
        await checkAndAutoAdvance(newName); 
    } else { 
        fetchBattles(); 
    }
}

window.setWinner = function(id, winnerId) { 
    showModal('CONFIRMAR VENCEDOR?', 'Essa ação avança o piloto.', 'normal', async () => { 
        await sb.from('battles').update({ winner_id: winnerId, status: 'finished' }).eq('id', id); 
        fetchBattles(); 
    }); 
}

window.setOMT = function(id, count) { 
    showModal('DECLARAR OMT?', 'One More Time (Nova corrida).', 'normal', async () => { 
        await sb.from('battles').update({ omt_count: count+1 }).eq('id', id); 
        fetchBattles(); 
    }); 
}

// --- 10. FINALIZAÇÃO DA ETAPA E PONTUAÇÃO ---
window.calculateAndFinishStage = function() {
    showModal('FINALIZAR ETAPA?', 'Isso soma os pontos no ranking e zera as notas para a próxima etapa.', 'normal', async () => {
        showToast("Processando...", "info");
        
        const { data: allBattles } = await sb.from('battles').select('*').eq('category', currentCategory);
        const { data: driversRanked } = await sb.from('drivers').select('*').eq('category', currentCategory).order('best_score', { ascending: false });
        
        const finalBattle = allBattles.find(b => b.round_name === 'FINAL');
        
        if (!finalBattle || !finalBattle.winner_id) { 
            showToast("ERRO: Final não encontrada ou sem vencedor!", "error"); 
            return; 
        }
        
        // Define o Ranking Final da Batalha
        let finalRank = []; 
        let winnerId = finalBattle.winner_id;
        let runnerId = (winnerId === finalBattle.driver1_id) ? finalBattle.driver2_id : finalBattle.driver1_id;
        
        finalRank.push(winnerId); // 1º
        finalRank.push(runnerId); // 2º
        
        // Adiciona perdedores de cada fase, ordenados pelo Qualify (Regra de Drift)
        finalRank.push(...sortByQualify(getLosersByRound(allBattles, 'SEMI'), driversRanked));
        finalRank.push(...sortByQualify(getLosersByRound(allBattles, 'TOP 8'), driversRanked));
        finalRank.push(...sortByQualify(getLosersByRound(allBattles, 'TOP 16'), driversRanked));
        finalRank.push(...sortByQualify(getLosersByRound(allBattles, 'TOP 32'), driversRanked));

        // Distribui Pontos
        for (let i = 0; i < finalRank.length; i++) {
            let driverId = finalRank[i];
            if (driverId && i < POINTS_TABLE.length) {
                let points = POINTS_TABLE[i];
                const { data: d } = await sb.from('drivers').select('season_points').eq('id', driverId).single();
                if (d) {
                    // Soma os pontos atuais + pontos da etapa
                    await sb.from('drivers').update({ season_points: (d.season_points || 0) + points }).eq('id', driverId);
                }
            }
        }

        // Bônus de P1 no Qualify
        if (driversRanked.length > 0) {
            let p1ID = driversRanked[0].id;
            const { data: freshDriver } = await sb.from('drivers').select('season_points').eq('id', p1ID).single();
            if (freshDriver) {
                await sb.from('drivers').update({ season_points: (freshDriver.season_points || 0) + QUALIFY_BONUS_P1 }).eq('id', p1ID);
            }
        }

        // Zera as notas para a próxima etapa (Reset Parcial)
        await sb.from('drivers').update({ 
            run1: 0, run2: 0, 
            run1_line:0, run1_angle:0, run1_style:0, 
            run2_line:0, run2_angle:0, run2_style:0, 
            best_score: 0 
        }).neq('id', 0);
        
        // Apaga as batalhas
        await sb.from('battles').delete().neq('id', 0);
        
        showToast("Etapa concluída e salva!", 'success'); 
        setTimeout(() => location.reload(), 2000);
    });
}

// Funções Auxiliares de Ranking
function getLosersByRound(battles, roundName) {
    let losers = [];
    battles.filter(b => b.round_name === roundName && b.status === 'finished').forEach(b => {
        let l = (b.winner_id === b.driver1_id) ? b.driver2_id : b.driver1_id;
        if(l) losers.push(l);
    });
    return losers;
}

function sortByQualify(driverIds, qualifyList) {
    return driverIds.sort((a, b) => {
        let idxA = qualifyList.findIndex(d => d.id === a);
        let idxB = qualifyList.findIndex(d => d.id === b);
        if (idxA === -1) idxA = 999; if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });
}

// Reset Total do Campeonato
window.forceResetAll = function() {
    showModal('RESETAR CAMPEONATO?', 'Isso APAGA TODOS os pilotos e batalhas. Zera tudo.', 'input-danger', async () => {
        await sb.from('battles').delete().neq('id', 0);
        await sb.from('drivers').delete().neq('id', 0);
        showToast("Banco de dados limpo!", 'success');
        setTimeout(() => location.reload(), 1500);
    });
}

// Renderização do Ranking Geral
async function fetchSeasonRanking() {
    document.getElementById('rankingProList').innerHTML = 'Carregando...';
    document.getElementById('rankingLightList').innerHTML = 'Carregando...';
    
    const { data: allDrivers } = await sb.from('drivers')
        .select('*')
        .order('season_points', { ascending: false });
        
    if (!allDrivers) return;
    
    renderRankingTable('rankingProList', allDrivers.filter(d => d.category === 'PRO'));
    renderRankingTable('rankingLightList', allDrivers.filter(d => d.category === 'LIGHT'));
}

function renderRankingTable(elementId, list) {
    const container = document.getElementById(elementId);
    if (list.length === 0) { 
        container.innerHTML = '<p class="empty-msg">Sem pontuação.</p>'; 
        return; 
    }
    
    container.innerHTML = list.map((d, i) => `
        <div class="rank-row">
            <span class="rank-pos">#${i+1}</span>
            <span class="rank-name">${d.name}</span>
            <span class="rank-pts">${d.season_points}</span>
        </div>`).join('');
}