// --- КОНФИГУРАЦИЯ ---
const CONTRACT_ADDRESS = "0xВАШ_АДРЕС_ЗАДЕПЛОЕННОГО_КОНТРАКТА"; // Вставьте деплой-адрес
const USDT_ADDRESS = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"; // Sepolia USDT ERC-20 Address

const ESCROW_ABI = [
    "function currentTrancheId() view returns (uint256)",
    "function isFunded() view returns (bool)",
    "function investor() view returns (address)",
    "function receiver() view returns (address)",
    "function oracle() view returns (address)",
    "function participant0() view returns (address)",
    "function participant1() view returns (address)",
    "function participant2() view returns (address)",
    "function participant3() view returns (address)",
    "function investorSigned() view returns (bool)",
    "function oracleSigned() view returns (bool)",
    "function receiverSigned() view returns (bool)",
    "function getTrancheDetails(uint256 trancheId) view returns (uint256 eurVolume, uint256 currentEurUsdtRate, uint256 grossUsdtRequired, uint256 grossEthRequired, uint256 investorShareUsdt, uint256 oracleShareUsdt, uint256 participant0ShareUsdt, uint256 participant1ShareUsdt, uint256 participant2ShareUsdt, uint256 participant3ShareUsdt, uint256 netUsdtToPay, uint256 netEthToPay, bool isFundedStatus, uint256 signatureTimeLeft)",
    "function depositTrancheAndGas() external payable",
    "function signTranche() external",
    "function emergencyWithdrawInactivity() external"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
];

let provider = null;
let signer = null;
let userAddress = null;
let escrowContract = null;
let usdtContract = null;

// --- ЧАСЫ ЛОНДОНА ---
function updateLondonClock() {
    const clockElem = document.getElementById('londonClock');
    if (!clockElem) return;
    const options = { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    clockElem.innerText = new Intl.DateTimeFormat('en-GB', options).format(new Date()) + " GMT";
}
setInterval(updateLondonClock, 1000);

// --- ПОДКТЮЧЕНИЕ КОШЕЛЬКА ---
document.getElementById('btnConnectWallet').addEventListener('click', async () => {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();

            document.getElementById('walletAddress').innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
            document.getElementById('contractAddrDisplay').innerText = CONTRACT_ADDRESS;

            escrowContract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
            usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);

            logStatus(`Кошелек подключен: ${userAddress}`);
            await refreshData();
            setInterval(refreshData, 5000); // Авто-обновление каждые 5 сек
        } catch (err) {
            logStatus("Ошибка подключения кошелька: " + err.message);
        }
    } else {
        alert("Пожалуйста, установите MetaMask или откройте через Web3-браузер.");
    }
});

// --- СЧИТЫВАНИЕ И ОТОБРАЖЕНИЕ ДАННЫХ КОНТРАКТА ---
async function refreshData() {
    if (!escrowContract) return;

    try {
        const currentTranche = await escrowContract.currentTrancheId();
        document.getElementById('currentTrancheId').innerText = currentTranche.toString();

        const details = await escrowContract.getTrancheDetails(currentTranche);

        // Парсинг данных
        const eurVol = ethers.formatUnits(details.eurVolume, 18);
        const rate = (Number(details.currentEurUsdtRate) / 1e8).toFixed(4);
        const grossUsdt = (Number(details.grossUsdtRequired) / 1e6).toFixed(2);
        const grossEth = ethers.formatEther(details.grossEthRequired);

        const netUsdt = (Number(details.netUsdtToPay) / 1e6).toFixed(2);
        const netEth = ethers.formatEther(details.netEthToPay);

        document.getElementById('trancheEurVolume').innerText = `${Number(eurVol).toLocaleString()} EUR`;
        document.getElementById('oracleRate').innerText = `${rate} USD / EUR`;
        document.getElementById('requiredUsdt').innerText = `${Number(grossUsdt).toLocaleString()} USDT`;
        document.getElementById('requiredEth').innerText = `${grossEth} ETH`;

        document.getElementById('netUsdtToPay').innerText = `${Number(netUsdt).toLocaleString()} USDT`;
        document.getElementById('netEthToPay').innerText = `${netEth} ETH`;

        // Расчет буфера 2.75%
        const bufferUsdt = (Number(grossUsdt) * (275 / 5775)).toFixed(2);
        document.getElementById('bufferAmountUsdt').innerText = `${Number(bufferUsdt).toLocaleString()} USDT`;

        // Статус
        const isFunded = details.isFundedStatus;
        const statusBadge = document.getElementById('contractStatusBadge');
        if (isFunded) {
            statusBadge.innerText = "ТРАНШ ПРОФИНАНСИРОВАН / FUNDED";
            statusBadge.className = "badge success";
        } else {
            statusBadge.innerText = "ОЖИДАЕТ ДЕПОЗИТА / PENDING";
            statusBadge.className = "badge warning";
        }

        // Таймер подписей (10 минут)
        const timeLeft = Number(details.signatureTimeLeft);
        if (timeLeft > 0) {
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            document.getElementById('signatureTimer').innerText = `${m}м ${s < 10 ? '0' : ''}${s}с`;
        } else {
            document.getElementById('signatureTimer').innerText = "00м 00с (Таймер не активен)";
        }

        // Подписи
        const invSigned = await escrowContract.investorSigned();
        const oraSigned = await escrowContract.oracleSigned();
        const recSigned = await escrowContract.receiverSigned();

        updateSignatureBadge('badgeInvestor', invSigned);
        updateSignatureBadge('badgeOracle', oraSigned);
        updateSignatureBadge('badgeReceiver', recSigned);

        // Роли и выплаты
        const invAddr = await escrowContract.investor();
        const recAddr = await escrowContract.receiver();
        const oraAddr = await escrowContract.oracle();

        document.getElementById('addrInvestor').innerText = `${invAddr.substring(0, 6)}...${invAddr.substring(38)}`;
        document.getElementById('addrOracle').innerText = `${oraAddr.substring(0, 6)}...${oraAddr.substring(38)}`;
        document.getElementById('addrParticipant0').innerText = `${(await escrowContract.participant0()).substring(0, 6)}...`;
        document.getElementById('addrParticipant1').innerText = `${(await escrowContract.participant1()).substring(0, 6)}...`;
        document.getElementById('addrParticipant2').innerText = `${(await escrowContract.participant2()).substring(0, 6)}...`;
        document.getElementById('addrParticipant3').innerText = `${(await escrowContract.participant3()).substring(0, 6)}...`;

        document.getElementById('shareInvestor').innerText = `${(Number(details.investorShareUsdt) / 1e6).toFixed(2)} USDT`;
        document.getElementById('shareOracle').innerText = `${(Number(details.oracleShareUsdt) / 1e6).toFixed(2)} USDT`;
        document.getElementById('sharePart0').innerText = `${(Number(details.participant0ShareUsdt) / 1e6).toFixed(2)} USDT`;
        document.getElementById('sharePart1').innerText = `${(Number(details.participant1ShareUsdt) / 1e6).toFixed(2)} USDT`;
        document.getElementById('sharePart2').innerText = `${(Number(details.participant2ShareUsdt) / 1e6).toFixed(2)} USDT`;
        document.getElementById('sharePart3').innerText = `${(Number(details.participant3ShareUsdt) / 1e6).toFixed(2)} USDT`;

        // Определение роли текущего кошелька
        const userHex = userAddress.toLowerCase();
        if (userHex === invAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Инвестор (Investor)";
        } else if (userHex === recAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Приемка (Receiver)";
        } else if (userHex === oraAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Оракул (Oracle)";
        } else {
            document.getElementById('userRoleDisplay').innerText = "Наблюдатель";
        }

    } catch (err) {
        console.error("Ошибка обновления данных:", err);
    }
}

function updateSignatureBadge(elemId, isSigned) {
    const elem = document.getElementById(elemId);
    if (isSigned) {
        elem.innerText = "ПОДПИСАНО";
        elem.className = "badge success";
    } else {
        elem.innerText = "Ожидание";
        elem.className = "badge warning";
    }
}

// --- ДЕЙСТВИЯ С ТРАНЗАКЦИЯМИ ---

// 1. Approve USDT
document.getElementById('btnApproveUsdt').addEventListener('click', async () => {
    try {
        const currentTranche = await escrowContract.currentTrancheId();
        const details = await escrowContract.getTrancheDetails(currentTranche);
        const usdtToPay = details.netUsdtToPay;

        logStatus("Запрос Approve USDT...");
        const tx = await usdtContract.approve(CONTRACT_ADDRESS, usdtToPay);
        logStatus(`Транзакция отправлена: ${tx.hash}`);
        await tx.wait();
        logStatus("Approve подтвержден!");
    } catch (err) {
        logStatus("Ошибка Approve: " + err.message);
    }
});

// 2. Deposit Tranche
document.getElementById('btnDepositTranche').addEventListener('click', async () => {
    try {
        const currentTranche = await escrowContract.currentTrancheId();
        const details = await escrowContract.getTrancheDetails(currentTranche);
        const ethToPay = details.netEthToPay;

        logStatus("Отправка депозита USDT + ETH...");
        const tx = await escrowContract.depositTrancheAndGas({ value: ethToPay });
        logStatus(`Депозит отправлен: ${tx.hash}`);
        await tx.wait();
        logStatus("Депозит успешно внесен!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка депозита: " + err.message);
    }
});

// 3. Подписи участников
async function handleSign() {
    try {
        logStatus("Отправка подписи в блокчейн...");
        const tx = await escrowContract.signTranche();
        logStatus(`Подпись отправлена: ${tx.hash}`);
        await tx.wait();
        logStatus("Подпись успешно зафиксирована!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка подписи: " + err.message);
    }
}

document.getElementById('btnSignInvestor').addEventListener('click', handleSign);
document.getElementById('btnSignOracle').addEventListener('click', handleSign);
document.getElementById('btnSignReceiver').addEventListener('click', handleSign);

// 4. Emergency Withdraw
document.getElementById('btnEmergencyWithdraw').addEventListener('click', async () => {
    try {
        logStatus("Запрос Emergency Withdraw...");
        const tx = await escrowContract.emergencyWithdrawInactivity();
        logStatus(`Транзакция отправлена: ${tx.hash}`);
        await tx.wait();
        logStatus("Аварийный возврат выполнен!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка возврата: " + err.message);
    }
});

function logStatus(msg) {
    const logElem = document.getElementById('statusLog');
    logElem.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
}