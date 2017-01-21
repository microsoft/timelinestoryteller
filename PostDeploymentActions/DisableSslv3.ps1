# You can use the -SetCipherOrder (or -sco) option to also set the TLS cipher
# suite order. Change the cipherorder variable below to the order you want to set on the
# server. Setting this requires a reboot to take effect.

echo "this is DisableSslv3.ps1 local"

param (
 [parameter(Mandatory=$false)]
 [alias(sco)]
 [switch]$SetCipherOrder)

$regkeys = @(
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.0",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.0\Client",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.0\Server",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.1",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.1\Client",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.1\Server",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Client",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Server",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 2.0",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 2.0\Client",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 2.0\Server",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 3.0",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 3.0\Client",
"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 3.0\Server",
"HKLM:\SOFTWARE\Policies\Microsoft\Cryptography\Configuration\SSL0010002"
)
$cipherorder = "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384_P384,TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256_P256,"
$cipherorder += "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA_P384,TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA_P256,"
$cipherorder += "TLS_RSA_WITH_AES_256_CBC_SHA256,TLS_RSA_WITH_AES_128_CBC_SHA256,"
$cipherorder += "TLS_RSA_WITH_AES_256_CBC_SHA,TLS_RSA_WITH_AES_128_CBC_SHA,TLS_RSA_WITH_3DES_EDE_CBC_SHA"

# If any settings are changed, this will change to $True and the server will reboot
$reboot = $False

Function Set-CryptoSetting {
  param (
    $keyindex,
    $value,
    $valuedata,
    $valuetype,
    $restart
  )

  # Check for existence of registry key, and create if it does not exist
  If (!(Test-Path -Path $regkeys[$keyindex])) {
    New-Item $regkeys[$keyindex] | Out-Null
  }

  # Get data of registry value, or null if it does not exist
  $val = (Get-ItemProperty -Path $regkeys[$keyindex] -Name $value -ErrorAction SilentlyContinue).$value

  If ($val -eq $null) {
    # Value does not exist - create and set to desired value
    New-ItemProperty -Path $regkeys[$keyindex] -Name $value -Value $valuedata -PropertyType $valuetype | Out-Null
    $restart = $True
  } Else {
    # Value does exist - if not equal to desired value, change it
    If ($val -ne $valuedata) {
      Set-ItemProperty -Path $regkeys[$keyindex] -Name $value -Value $valuedata
      $restart = $True
    }
  }

  If ($SetCpiherOrder) {
    Set-ItemProperty -Path $regkeys[15] -Name functions -Value $cipherorder
    $restart = $True
  }
  return $restart
}

# Check for existence of parent registry keys (SSL 2.0 and SSL 3.0), and create if they do not exist
For ($i = 9; $i -le 12; $i = $i + 3) {
  If (!(Test-Path -Path $regkeys[$i])) {
    New-Item $regkeys[$i] | Out-Null
  }
}

# Ensure SSL 2.0 disabled for client
$reboot = Set-CryptoSetting 10 DisabledByDefault 1 DWord $reboot

# Ensure SSL 2.0 disabled for server
$reboot = Set-CryptoSetting 11 Enabled 0 DWord $reboot

# Ensure SSL 3.0 disabled for client
$reboot = Set-CryptoSetting 13 DisabledByDefault 1 DWord $reboot

# Ensure SSL 3.0 disabled for server
$reboot = Set-CryptoSetting 14 Enabled 0 DWord $reboot

# If any settings were changed, reboot
If ($reboot) {
  Write-Host "Rebooting now..."
  shutdown.exe /r /t 5 /c "Crypto settings changed" /f /d p:2:4
}
