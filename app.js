// Конфигурация контракта / Contract Configuration
const ESCROW_ADDRESS = "0x1234567890123456789012345678901234567890"; // Укажите адрес деплоя

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
  "function signTranche() external"
];

let provider;
let escrowContract;
let userSigner = null;
let isTrancheFundedGlobal = false;
let currentTrancheIdGlobal = 0;

// Инициализация / App Init
async function init() {
  startClock();

  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
  } else {
    // Публичный RPC Sepolia / Mainnet
    provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth_sepolia");
  }

  escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
  
  document.getElementById("contractAddressDisplay").innerText = ESCROW_ADDRESS;

  await refreshData();
  setInterval(refreshData, 4000);
}

// Часы GMT / GMT Clock
function startClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById("gmtTime").innerText = now.toUTCString().split(" ")[4] + " GMT";
  }, 1000);
}

// Переключение языка / Language Toggle
let currentLang = "RU";
function toggleLanguage() {
  currentLang = currentLang === "RU" ? "EN" : "RU";
  document.getElementById("langToggleBtn").innerText = currentLang === "RU" ? "English" : "Русский";
}

// Подключение MetaMask
async function connectMetaMask() {
  if (window.ethereum) {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      userSigner = await provider.getSigner();
      const address = await userSigner.getAddress();
      document.getElementById("userAddress").innerText = `${address.substring(0, 6)}...${address.substring(38)}`;
      
      // Определение роли
      const [inv, rec, orc] = await Promise.all([
        escrowContract.investor(),
        escrowContract.receiver(),
        escrowContract.oracle()
      ]);

      let role = "Участник / Participant";
      if (address.toLowerCase() === inv.toLowerCase()) role = "Инвестор (Investor)";
      if (address.toLowerCase() === rec.toLowerCase()) role = "Приемка (Receiver)";
      if (address.toLowerCase() === orc.toLowerCase()) role = "Оракул (Oracle)";

      document.getElementById("userRole").innerText = role;
    } catch (e) {
      console.error(e);
    }
  } else {
    alert("MetaMask не обнаружен / MetaMask not found");
  }
}

// Обновление данных из контракта
async function refreshData() {
  try {
    const trancheId = await escrowContract.currentTrancheId();
    currentTrancheIdGlobal = trancheId;

    const details = await escrowContract.getTrancheDetails(trancheId);
    
    isTrancheFundedGlobal = details.isFundedStatus;

    // Заполнение полей UI
    const eurVol = ethers.formatUnits(details.eurVolume, 18);
    const rate = (Number(details.currentEurUsdtRate) / 1e8).toFixed(4);
    const grossUsdt = ethers.formatUnits(details.grossUsdtRequired, 6);
    const grossEth = ethers.formatUnits(details.grossEthRequired, 18);

    document.getElementById("eurVolumeDisplay").innerText = `${Number(eurVol).toLocaleString()} EUR`;
    document.getElementById("oracleRateDisplay").innerText = `$${rate}`;
    document.getElementById("requiredUsdtDisplay").innerText = `${Number(grossUsdt).toLocaleString()} USDT`;
    document.getElementById("requiredEthDisplay").innerText = `${Number(grossEth).toFixed(4)} ETH`;

    // Требуется к доплате
    const netUsdt = ethers.formatUnits(details.netUsdtToPay, 6);
    const netEth = ethers.formatUnits(details.netEthToPay, 18);
    document.getElementById("netUsdtToPay").innerText = `${Number(netUsdt).toLocaleString()} USDT`;
    document.getElementById("netEthToPay").innerText = `${Number(netEth).toFixed(4)} ETH`;

    // Статус Депозита
    const statusBadge = document.getElementById("contractStatusBadge");
    if (isTrancheFundedGlobal) {
      statusBadge.className = "badge badge-success";
      statusBadge.innerText = "✓ Депозит Внесен / Funded";
    } else {
      statusBadge.className = "badge badge-warning";
      statusBadge.innerText = "Ожидание депозита / Awaiting Deposit";
    }

    // Подписи
    const [invSigned, orcSigned, recSigned] = await Promise.all([
      escrowContract.investorSigned(),
      escrowContract.oracleSigned(),
      escrowContract.receiverSigned()
    ]);

    updateSignBadge("statusInvestor", invSigned);
    updateSignBadge("statusOracle", orcSigned);
    updateSignBadge("statusReceiver", recSigned);

    // Таймер подписей
    const timeLeft = Number(details.signatureTimeLeft);
    if (timeLeft > 0) {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      document.getElementById("signatureTimer").innerText = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    } else {
      document.getElementById("signatureTimer").innerText = "10m 00s";
    }

    // Заполнение реестра выплат
    await updatePayeesTable(details, eurVol);

  } catch (err) {
    console.error("Ошибка при обновлении данных:", err);
  }
}

function updateSignBadge(elemId, isSigned) {
  const el = document.getElementById(elemId);
  if (isSigned) {
    el.className = "badge badge-success my-8";
    el.innerText = "✓ Подписано / Signed";
  } else {
    el.className = "badge badge-warning my-8";
    el.innerText = "Ожидание / Pending";
  }
}

// Обновление таблицы реестра выплат
async function updatePayeesTable(details, eurVol) {
  const [inv, rec, orc, p0, p1, p2, p3] = await Promise.all([
    escrowContract.investor(),
    escrowContract.receiver(),
    escrowContract.oracle(),
    escrowContract.participant0(),
    escrowContract.participant1(),
    escrowContract.participant2(),
    escrowContract.participant3()
  ]);

  const rows = [
    { name: "Инвестор (Investor)", Bps: "10.00%", addr: inv, val: details.investorShareUsdt },
    { name: "Оракул (Oracle)", Bps: "10.00%", addr: orc, val: details.oracleShareUsdt },
    { name: "Участник №0 (Participant #0)", Bps: "5.00%", addr: p0, val: details.participant0ShareUsdt },
    { name: "Участник №1 (Participant #1)", Bps: "10.00%", addr: p1, val: details.participant1ShareUsdt },
    { name: "Участник №2 (Participant #2)", Bps: "10.00%", addr: p2, val: details.participant2ShareUsdt },
    { name: "Участник №3 (Participant #3)", Bps: "10.00%", addr: p3, val: details.participant3ShareUsdt }
  ];

  const tbody = document.getElementById("payeesTableBody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.Bps}</td>
      <td><code>${r.addr.substring(0, 8)}...${r.addr.substring(36)}</code></td>
      <td>${Number(ethers.formatUnits(r.val, 6)).toLocaleString()} USDT</td>
    </tr>
  `).join("");
}

// ЛОГИКА ОГРАНИЧЕНИЙ И СЧЕТЧИКА ПОПЫТОК (3 КЛИКА)
function checkQrLimitsAndIncrement() {
  // Если депозит полностью пополнен - ограничения сняты!
  if (isTrancheFundedGlobal) {
    return { allowed: true, attemptsLeft: Infinity };
  }

  let attempts = parseInt(sessionStorage.getItem("qr_attempts_count") || "0");

  if (attempts >= 3) {
    return { 
      allowed: false, 
      msg: "Для активации QR-кода необходимо пополнить депозит.\nTo activate the QR code, you must top up the deposit." 
    };
  }

  attempts++;
  sessionStorage.setItem("qr_attempts_count", attempts.toString());
  return { allowed: true, attemptsLeft: 3 - attempts };
}

// Генерация QR подписи
function generateSignatureQR(role) {
  const check = checkQrLimitsAndIncrement();

  if (!check.allowed) {
    showModal("Лимит исчерпан / Limit Reached", null, check.msg);
    return;
  }

  const signInterface = new ethers.Interface(["function signTranche()"]);
  const calldata = signInterface.encodeFunctionData("signTranche");
  const uri = `ethereum:${ESCROW_ADDRESS}@1?data=${calldata}`;

  const roleTitle = role.toUpperCase();
  const limitInfo = isTrancheFundedGlobal 
    ? "Безлимитный режим (Депозит пополнен) / Unlimited Mode" 
    : `Тестовая попытка (Test attempt): ${3 - check.attemptsLeft} из 3`;

  showModal(`Подпись / Signature: ${roleTitle}`, uri, limitInfo);
}

// Обработка клика по кнопке пополнения депозита
function handleDepositClick() {
  const check = checkQrLimitsAndIncrement();

  if (!check.allowed) {
    showModal("Лимит исчерпан / Limit Reached", null, check.msg);
    return;
  }

  const depositInterface = new ethers.Interface(["function depositTrancheAndGas()"]);
  const calldata = depositInterface.encodeFunctionData("depositTrancheAndGas");
  const uri = `ethereum:${ESCROW_ADDRESS}@1?data=${calldata}`;

  showModal("Пополнение депозита / Deposit Funds", uri, "Отсканируйте через Tangem / WalletConnect");
}

function openGeneralWalletQR() {
  generateSignatureQR('investor');
}

// Показ Модального окна с QR
function showModal(title, uriData, messageText) {
  document.getElementById("modalTitle").innerText = title;
  document.getElementById("qrMessage").innerText = messageText;

  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = "";

  if (uriData) {
    new QRCode(qrContainer, {
      text: uriData,
      width: 210,
      height: 210,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  document.getElementById("qrModal").style.display = "flex";
}

function closeQRModal() {
  document.getElementById("qrModal").style.display = "none";
}

window.addEventListener("DOMContentLoaded", init);
