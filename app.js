// --- КОНФИГУРАЦИЯ / CONFIGURATION ---
const CONTRACT_ADDRESS = "0xВАШ_АДРЕС_ЗАДЕПЛОЕННОГО_КОНТРАКТА"; 
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

// --- ЧАСЫ ЛОНДОНА / LONDON CLOCK ---
function updateLondonClock() {
    const clockElem = document.getElementById('londonClock');
    if (!clockElem) return;
    const options = { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    clockElem.innerText = new Intl.DateTimeFormat('en-GB', options).format(new Date()) + " GMT";
}
setInterval(updateLondonClock, 1000);

// --- ПОДКТЮЧЕНИЕ КОШЕЛЬКА / WALLET CONNECTION ---
document.getElementById('btnConnectWallet').addEventListener('click', async () => {
    try {
        if (window.web3modal) {
            await window.web3modal.open();
            const walletProvider = window.web3modal.getWalletProvider();
            if (walletProvider) {
                provider = new ethers.BrowserProvider(walletProvider);
                signer = await provider.getSigner();
                userAddress = await signer.getAddress();
                initContracts();
            }
        } else if (window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            initContracts();
        } else {
            alert("Кошелек не найден / Wallet provider not found.");
        }
    } catch (err) {
        logStatus("Ошибка подключения / Connection error: " + err.message);
    }
});

async function initContracts() {
    document.getElementById('walletAddress').innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
    document.getElementById('contractAddrDisplay').innerText = CONTRACT_ADDRESS;

    escrowContract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
    usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);

    logStatus(`Кошелек подключен / Wallet connected: ${userAddress}`);
    await refreshData();
    setInterval(refreshData, 5000);
}

// --- ПРОВЕРКА БАЛАНСА ГАЗА (ETH) / GAS BALANCE CHECK ---
async function checkGasBalance(estimatedGasUnits, valueWeiToSend = 0n) {
    const balanceWei = await provider.getBalance(userAddress);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("20", "gwei");

    // Запас 20% на колебания gwei / 20% safety margin for gas price spikes
    const estimatedGasFeeWei = (estimatedGasUnits * gasPrice * 120n) / 100n;
    const totalEthRequiredWei = estimatedGasFeeWei + valueWeiToSend;

    if (balanceWei < totalEthRequiredWei) {
        const currentEth = ethers.formatEther(balanceWei);
        const requiredEth = ethers.formatEther(totalEthRequiredWei);
        const gasFeeOnly = ethers.formatEther(estimatedGasFeeWei);

        const errorMsg = `Недостаточно ETH для газа! / Insufficient ETH for gas!\n` +
            `Баланс / Balance: ${Number(currentEth).toFixed(5)} ETH\n` +
            `Требуемый газ / Required Gas Fee: ~${Number(gasFeeOnly).toFixed(5)} ETH\n` +
            `Всего требуется / Total Required: ${Number(requiredEth).toFixed(5)} ETH`;

        alert(errorMsg);
        logStatus(`Ошибка: Недостаточно ETH на балансе (${Number(currentEth).toFixed(5)} ETH из ${Number(requiredEth).toFixed(5)} ETH) / Gas Error: Insufficient ETH`);
        return false;
    }
    return true;
}

// --- СЧИТЫВАНИЕ И ОТОБРАЖЕНИЕ ДАННЫХ / DATA REFRESH ---
async function refreshData() {
    if (!escrowContract) return;

    try {
        const currentTranche = await escrowContract.currentTrancheId();
        document.getElementById('currentTrancheId').innerText = currentTranche.toString();

        const details = await escrowContract.getTrancheDetails(currentTranche);

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

        const bufferUsdt = (Number(grossUsdt) * (275 / 5775)).toFixed(2);
        document.getElementById('bufferAmountUsdt').innerText = `${Number(bufferUsdt).toLocaleString()} USDT`;

        const isFunded = details.isFundedStatus;
        const statusBadge = document.getElementById('contractStatusBadge');
        if (isFunded) {
            statusBadge.innerText = "ПРОФИНАНСИРОВАН / FUNDED";
            statusBadge.className = "badge success";
        } else {
            statusBadge.innerText = "ОЖИДАЕТ ДЕПОЗИТА / PENDING DEPOSIT";
            statusBadge.className = "badge warning";
        }

        const timeLeft = Number(details.signatureTimeLeft);
        if (timeLeft > 0) {
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            document.getElementById('signatureTimer').innerText = `${m}m ${s < 10 ? '0' : ''}${s}s`;
        } else {
            document.getElementById('signatureTimer').innerText = "00m 00s (Не активен / Inactive)";
        }

        const invSigned = await escrowContract.investorSigned();
        const oraSigned = await escrowContract.oracleSigned();
        const recSigned = await escrowContract.receiverSigned();

        updateSignatureBadge('badgeInvestor', invSigned);
        updateSignatureBadge('badgeOracle', oraSigned);
        updateSignatureBadge('badgeReceiver', recSigned);

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

        const userHex = userAddress.toLowerCase();
        if (userHex === invAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Инвестор / Investor";
        } else if (userHex === recAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Приемка / Receiver";
        } else if (userHex === oraAddr.toLowerCase()) {
            document.getElementById('userRoleDisplay').innerText = "Оракул / Oracle";
        } else {
            document.getElementById('userRoleDisplay').innerText = "Наблюдатель / Viewer";
        }

    } catch (err) {
        console.error("Ошибка обновления / Refresh error:", err);
    }
}

function updateSignatureBadge(elemId, isSigned) {
    const elem = document.getElementById(elemId);
    if (isSigned) {
        elem.innerText = "ПОДПИСАНО / SIGNED";
        elem.className = "badge success";
    } else {
        elem.innerText = "Ожидание / Pending";
        elem.className = "badge warning";
    }
}

// --- ТРАНЗАКЦИИ / TRANSACTIONS ---

// 1. Approve USDT
document.getElementById('btnApproveUsdt').addEventListener('click', async () => {
    try {
        if (!signer) return alert("Подключите кошелек / Connect wallet");
        
        const currentTranche = await escrowContract.currentTrancheId();
        const details = await escrowContract.getTrancheDetails(currentTranche);
        const usdtToPay = details.netUsdtToPay;

        logStatus("Оценка газа для Approve... / Estimating gas for Approve...");
        const estimatedGas = await usdtContract.approve.estimateGas(CONTRACT_ADDRESS, usdtToPay);

        const hasEnoughEth = await checkGasBalance(estimatedGas);
        if (!hasEnoughEth) return;

        logStatus("Запрос Approve USDT... / Requesting USDT Approve...");
        const tx = await usdtContract.approve(CONTRACT_ADDRESS, usdtToPay);
        logStatus(`Транзакция отправлена / Tx sent: ${tx.hash}`);
        await tx.wait();
        logStatus("Approve подтвержден! / Approve confirmed!");
    } catch (err) {
        logStatus("Ошибка Approve / Approve error: " + (err.reason || err.message));
    }
});

// 2. Deposit Tranche
document.getElementById('btnDepositTranche').addEventListener('click', async () => {
    try {
        if (!signer) return alert("Подключите кошелек / Connect wallet");

        const currentTranche = await escrowContract.currentTrancheId();
        const details = await escrowContract.getTrancheDetails(currentTranche);
        const ethToPay = details.netEthToPay;

        logStatus("Оценка газа для Депозита... / Estimating gas for Deposit...");
        const estimatedGas = await escrowContract.depositTrancheAndGas.estimateGas({ value: ethToPay });

        const hasEnoughEth = await checkGasBalance(estimatedGas, ethToPay);
        if (!hasEnoughEth) return;

        logStatus("Отправка депозита USDT + ETH... / Sending USDT + ETH Deposit...");
        const tx = await escrowContract.depositTrancheAndGas({ value: ethToPay });
        logStatus(`Депозит отправлен / Deposit sent: ${tx.hash}`);
        await tx.wait();
        logStatus("Депозит успешно внесен! / Deposit successfully sent!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка депозита / Deposit error: " + (err.reason || err.message));
    }
});

// 3. Подписи участников / Signatures
async function handleSign() {
    try {
        if (!signer) return alert("Подключите кошелек / Connect wallet");

        logStatus("Оценка газа для Подписи... / Estimating gas for Sign...");
        const estimatedGas = await escrowContract.signTranche.estimateGas();

        const hasEnoughEth = await checkGasBalance(estimatedGas);
        if (!hasEnoughEth) return;

        logStatus("Отправка подписи в блокчейн... / Submitting signature...");
        const tx = await escrowContract.signTranche();
        logStatus(`Подпись отправлена / Signature sent: ${tx.hash}`);
        await tx.wait();
        logStatus("Подпись успешно зафиксирована! / Signature confirmed!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка подписи / Sign error: " + (err.reason || err.message));
    }
}

document.getElementById('btnSignInvestor').addEventListener('click', handleSign);
document.getElementById('btnSignOracle').addEventListener('click', handleSign);
document.getElementById('btnSignReceiver').addEventListener('click', handleSign);

// 4. Emergency Withdraw
document.getElementById('btnEmergencyWithdraw').addEventListener('click', async () => {
    try {
        if (!signer) return alert("Подключите кошелек / Connect wallet");

        logStatus("Оценка газа для Emergency Withdraw... / Estimating gas...");
        const estimatedGas = await escrowContract.emergencyWithdrawInactivity.estimateGas();

        const hasEnoughEth = await checkGasBalance(estimatedGas);
        if (!hasEnoughEth) return;

        logStatus("Запрос Emergency Withdraw... / Requesting Emergency Withdraw...");
        const tx = await escrowContract.emergencyWithdrawInactivity();
        logStatus(`Транзакция отправлена / Tx sent: ${tx.hash}`);
        await tx.wait();
        logStatus("Аварийный возврат выполнен! / Emergency withdraw executed!");
        await refreshData();
    } catch (err) {
        logStatus("Ошибка возврата / Withdraw error: " + (err.reason || err.message));
    }
});

function logStatus(msg) {
    const logElem = document.getElementById('statusLog');
    logElem.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
}
