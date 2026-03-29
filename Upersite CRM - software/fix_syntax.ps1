$content = Get-Content "c:\Users\loren\Desktop\Business\Upersite CRM\Upersite CRM - software\src\components\CustomerDetail.jsx" -Raw

# Replace specifically the patterns for the three sections
# Using a more reliable way: find the end of the section
# TodoSection: ends before "export default function CustomerDetail"
$content = $content -replace '(?s)(const TodoSection = React\.memo\(.*?)\r?\n\}\r?\n\r?\nexport default', '$1' + "`r`n`});" + "`r`n`r`nexport default"

# FilesSection: ends before "/* ── NOTES (Rich Text) ── */"
$content = $content -replace '(?s)(const FilesSection = React\.memo\(.*?)\r?\n\}\r?\n\r?\n/\* ── NOTES \(Rich Text\) ── \*/', '$1' + "`r`n`});" + "`r`n`r`n/* ── NOTES (Rich Text) ── */"

# NotesSection: ends before "/* ── FILE PREVIEW MODAL ── */"
$content = $content -replace '(?s)(const NotesSection = React\.memo\(.*?)\r?\n\}\r?\n\r?\n/\* ── FILE PREVIEW MODAL ── \*/', '$1' + "`r`n`});" + "`r`n`r`n/* ── FILE PREVIEW MODAL ── */"

# For existing ones that might missing });
$content = $content -replace '(?s)(const GeneralSection = React\.memo\(.*?)\r?\n\r?\n/\* ── CONFIGURATION', '$1' + "`r`n`});" + "`r`n`r`n/* ── CONFIGURATION"

Set-Content "c:\Users\loren\Desktop\Business\Upersite CRM\Upersite CRM - software\src\components\CustomerDetail.jsx" $content -NoNewline
