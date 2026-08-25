$nodePath = "C:\Program Files\nodejs"
$currentMachine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$currentUser    = [System.Environment]::GetEnvironmentVariable("PATH", "User")

if ($currentMachine -notlike "*$nodePath*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$nodePath;$currentMachine", "Machine")
    Write-Host "Added to MACHINE PATH: $nodePath"
} else {
    Write-Host "Already in Machine PATH"
}

if ($currentUser -notlike "*$nodePath*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$nodePath;$currentUser", "User")
    Write-Host "Added to USER PATH: $nodePath"
} else {
    Write-Host "Already in User PATH"
}

Write-Host ""
Write-Host "Verifying node.exe is reachable..."
& "$nodePath\node.exe" --version
& "$nodePath\npm.cmd" --version
Write-Host ""
Write-Host "PATH fix complete. Please CLOSE this terminal and open a NEW one, then run:"
Write-Host "  cd C:\Calculator\client"
Write-Host "  npm install"
