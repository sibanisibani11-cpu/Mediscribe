$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$expected = Get-Content (Join-Path $root 'docs/microsoft-store-release.json') -Raw | ConvertFrom-Json
$packages = @(Get-ChildItem (Join-Path $root 'dist-electron/*.appx'))
if ($packages.Count -ne 1) { throw 'Expected exactly one Store candidate AppX' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($packages[0].FullName)
try {
    $entry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $entry) { throw 'Missing AppxManifest.xml' }
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $stream = $entry.Open()
    $reader = [System.Xml.XmlReader]::Create($stream, $settings)
    try {
        $manifest = [System.Xml.XmlDocument]::new()
        $manifest.XmlResolver = $null
        $manifest.Load($reader)
    } finally { $reader.Dispose(); $stream.Dispose() }
    $identity = $manifest.Package.Identity
    if ($identity.Name -cne $expected.identityName) { throw 'Store package name mismatch' }
    if ($identity.Publisher -cne $expected.publisher) { throw 'Store publisher mismatch' }
    if ($manifest.Package.Properties.PublisherDisplayName -cne $expected.publisherDisplayName) { throw 'Store publisher display name mismatch' }
    if ($identity.ProcessorArchitecture -cne $expected.candidateArchitecture) { throw 'Unvalidated Store architecture' }
    if ($identity.Version -cne $expected.candidateVersion) { throw 'Unexpected candidate version' }
    $version = [version]$identity.Version
    if ($version.Revision -ne 0 -or $version -le [version]$expected.previousVersion) { throw 'Store version must increase and end in .0' }
    Write-Host "Store identity verified: $($identity.Name), $($identity.Version), $($identity.ProcessorArchitecture)"
} finally { $archive.Dispose() }
Get-FileHash $packages[0].FullName -Algorithm SHA256 | Format-List
