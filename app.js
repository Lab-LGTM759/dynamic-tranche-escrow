// Адрес деплоя вашего смарт-контракта
const ESCROW_ADDRESS = "0xВаш_Адрес_Контракта";

// ABI вызовов чтения
const ESCROW_ABI = [
  "function currentTrancheId() view returns (uint256)",
  "function getTrancheDetails(uint256 trancheId) view returns (uint256 eurVolume, uint256 currentEurUsdtRate, uint256 grossUsdtRequired, uint256 grossEthRequired, uint256 investorShareUsdt, uint256 oracleShareUsdt, uint256 participant0ShareUsdt, uint256 participant1ShareUsdt, uint256 participant2ShareUsdt, uint256 participant3ShareUsdt, uint256 netUsdtToPay, uint256 netEthToPay, bool isFundedStatus, uint256 signatureTimeLeft)"
];

let provider;
let escrowContract;
let isTrancheFunded = false;
let qrInstance = null;

async function initApp() {
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
  } else {
    provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");
  }

  escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);

  await updateTrancheMonitor();
  setInterval(updateTrancheMonitor, 5000);
}

async function updateTrancheMonitor() {
  try {
    const currentId = await escrowContract.currentTrancheId();
    const details = await escrowContract.getTrancheDetails(currentId);

    const eurFormatted = ethers.formatUnits(details.eurVolume, 18);
    const rateFormatted = (Number(details.currentEurUsdtRate) / 1e8).toFixed(4); 
    const grossUsdtFormatted = ethers.formatUnits(details.grossUsdtRequired, 6);  

    const netUsdtToPay = details.netUsdtToPay;
    const netEthToPay = details.netEthToPay;

    const usdtToPayFormatted = ethers.formatUnits(netUsdtToPay, 6);
    const ethToPayFormatted = ethers.formatUnits(netEthToPay, 18);

    document.getElementById("trancheId").innerText = currentId.toString();
    document.getElementById("eurVolume").innerText = `${Number(eurFormatted).toLocaleString()} EUR`;
    document.getElementById("rate").innerText = `$${rateFormatted}`;
    document.getElementById("grossUsdt").innerText = `${Number(grossUsdtFormatted).toLocaleString()} USDT`;

    document.getElementById("netUsdtToPay").innerText = `${Number(usdtToPayFormatted).toLocaleString()} USDT`;
    document.getElementById("netEthToPay").innerText = `${Number(ethToPayFormatted).toFixed(4)} ETH`;

    const statusBadge = document.getElementById("statusBadge");

    if (netUsdtToPay === 0n && netEthToPay === 0n) {
      statusBadge.className = "status-badge status-ok";
      statusBadge.innerText = "✓ Депозит полностью покрыт";
      isTrancheFunded = true; // Депозит пополнен
    } else {
      statusBadge.className = "status-badge status-need-pay";
      statusBadge.innerText = "⚠ Требуется пополнение транша";
      isTrancheFunded = false;
    }

  } catch (error) {
    console.error("Ошибка при запросе к контракту:", error);
  }
}

// Генерация QR-кода подписи
function generateSignatureQR(role) {
  let attempts = parseInt(sessionStorage.getItem("qr_attempts") || "0");

  // Если депозит НЕ пополнен и сделано 3 клика
  if (!isTrancheFunded && attempts >= 3) {
    showModal(
      "Лимит исчерпан / Limit Reached",
      null,
      "Для активации QR кода надо пополнить депозит / To activate the QR code, you must deposit funds."
    );
    return;
  }

  // Увеличение счетчика попыток, если депозит еще не внесен
  if (!isTrancheFunded) {
    attempts++;
    sessionStorage.setItem("qr_attempts", attempts.toString());
  }

  // Вызов метода signTranche() в EVM
  const signMethodInterface = new ethers.Interface(["function signTranche()"]);
  const calldata = signMethodInterface.encodeFunctionData("signTranche");

  // Формирование URI для кошелька (Tangem / Metamask / WalletConnect)
  const qrUri = `ethereum:${ESCROW_ADDRESS}@1?data=${calldata}`;

  const roleNames = {
    investor: "Инвестор (Investor)",
    oracle: "Оракул (Oracle)",
    receiver: "Приемка (Receiver)"
  };

  showModal(`QR Подпись: ${roleNames[role]}`, qrUri, `Попытка ${isTrancheFunded ? 'безлимитно (депозит внесен)' : attempts + '/3'}`);
}

function showModal(title, uriData, messageText) {
  document.getElementById("modalTitle").innerText = title;
  document.getElementById("qrMessage").innerText = messageText;

  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = "";

  if (uriData) {
    qrInstance = new QRCode(qrContainer, {
      text: uriData,
      width: 200,
      height: 200,
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

window.addEventListener("DOMContentLoaded", initApp);
