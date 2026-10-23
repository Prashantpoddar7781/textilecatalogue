# Reads an Empire Access backup and writes tab-separated files for importEmpirePoonam.mjs.
# Usage: powershell -File backend/scripts/exportEmpirePoonam.ps1 -MdbPath "C:\path\BACKUP.MDB"
param(
  [Parameter(Mandatory = $true)][string]$MdbPath,
  [string]$OutDir = $(Join-Path $env:TEMP 'poonam-empire')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $MdbPath)) { throw "Backup not found: $MdbPath" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$conn = New-Object System.Data.Odbc.OdbcConnection
$conn.ConnectionString = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$MdbPath;"
$conn.Open()

function Export-Table([string]$Name, [string]$Sql) {
  $dest = Join-Path $OutDir "$Name.tsv"
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $Sql
  $reader = $cmd.ExecuteReader()
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $sw = New-Object System.IO.StreamWriter($dest, $false, $utf8)
  $headers = @()
  for ($i = 0; $i -lt $reader.FieldCount; $i++) { $headers += $reader.GetName($i) }
  $sw.WriteLine(($headers -join "`t"))
  $count = 0
  while ($reader.Read()) {
    $vals = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
      if ($reader.IsDBNull($i)) { $vals.Add(''); continue }
      $v = $reader.GetValue($i)
      if ($v -is [byte[]]) { $vals.Add(''); continue }
      $text = if ($v -is [datetime]) { $v.ToString('yyyy-MM-dd') } else { [string]$v }
      $text = $text -replace "[\t\r\n]", ' '
      $vals.Add($text)
    }
    $sw.WriteLine(($vals -join "`t"))
    $count++
  }
  $reader.Close()
  $sw.Close()
  Write-Output "$Name $count"
}

Export-Table 'atype' "SELECT ATYPE, NAME FROM ATYPE"
Export-Table 'acgroup' "SELECT gcode, NAME, ATYPE FROM ACGROUP"
Export-Table 'series' "SELECT SERIESCODE, SERIES FROM SERIES"
Export-Table 'master' "SELECT code, NAME, ADDRESS1, ADDRESS2, ADDRESS3, CITY1, STATE1, PHONE1, MOBILE, EMAIL, GCODE, ATYPE, GSTNO, gstin, PINNO, CONTACT, dhara, crdays, DRINTRATE, commission, FLASH_RMK, MSME_NO, MSME_TYPE, STATION FROM MASTER"
Export-Table 'qual' "SELECT qcode, NAME, PACKING, CUT, UNIT, CLOTHTYPE, category, MAINSCREEN, SELL1, SELL2, SELL3, GSTRATE, hsn_code, VATRATE, ADD_VATRATE FROM QUAL"
Export-Table 'bills' "SELECT CNO, TYPE, VNO, code, cCODE, BILL, DATE, CHALLAN, TRANSPORT, BILLAMT, TOTMTS, TOTPCS, DISCOUNT, OTH_LESS, RD_AMT, ADD_AMT, finalamt, paid, RMK, grossamt, billdis, haste, TDSRATE, TDSAMT, QUAL, RATE, discamt, ORDERNO, GRACEDAYS, PAYDAYS, VATRATE, VATAMT, ADD_VATRATE, ADD_VATAMT, BILLS_HSN_CODE, STATE_CODE, EWB_NO, vehicle_NO, RRNO, PLACE, BCODE FROM BILLS"
Export-Table 'billdet' "SELECT CNO, TYPE, VNO, SRNO, PACK, qual, RATE, MTS, CUT, PCS, UNIT, AMT, DETAILS, hsn_code, discamt, CATEGORY, DETVATRATE, DETVATAMT, DETADD_VATRATE, DETADD_VATAMT FROM BILLDET"
Export-Table 'fas' "SELECT CNO, TYPE, VNO, SRNO, code, DATE, CRAMT, DRAMT, RMK, BILLTYPE, BILLNO, DOCNO FROM FAS"
Export-Table 'recpay' "SELECT CNO, RECTYPE, RECVNO, BILLTYPE, BILLVNO, SRNO, AMT FROM RECPAY"
Export-Table 'pinvtrn' "SELECT CNO, TYPE, VNO, CARDNO, WEAVER, WCHAL, WCHDAT, WMTS, WPCS, MILL, DESPNO, DDATE, LOT, QUAL, RATE, BROKER_CODE, vehicle_NO, EWB_NO, DRMK, PURRATE FROM PINVTRN"
Export-Table 'millrec' "SELECT CNO, TYPE, VNO, CARDNO, RECRMK, RPCS, RMTS, CPCS, CCUT, CMTS, CUTDATE, JOBRATE, lot, DESPNO, GREYQUAL, RATE, SRNO, MILL_CODE, chalno, chaldate, PRINT_STYLE, WPCS, WMTS FROM MILLREC"
Export-Table 'cutdet' "SELECT CUTCARDNO, reccardno, CARDNO, lot, DESPNO, DESIGNNO, RPCS, RMTS, CPCS, CCUT, CMTS, CUTDATE, JOBRATE, FENT, SECONDS, SCREEN, WPCS, WMTS, GREYQUAL, RATE, MILL, RMK, WCHAL, WEAVER, RDATE FROM CUTDET"
Export-Table 'chaltrn' "SELECT CARDNO, SRNO, WMTS, MMTS, RMTS, CMTS FROM CHALTRN"
Export-Table 'company' "SELECT FIRM, NAME, ADDRESS1, ADDRESS2, ADDRESS3, CITY1, STATE1, PHONE1, MOBILE, EMAIL, PANNO, gstno, COMPANY_GSTIN, CPINNO, COMPANYTYPE FROM COMPMST"

$conn.Close()
Write-Output "OUT $OutDir"
