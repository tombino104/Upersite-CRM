$path = "c:\Users\loren\Desktop\Business\Upersite CRM\Upersite CRM - software - LAVORO\Upersite CRM - software\src\components\CustomerDetail.jsx"
(Get-Content $path) | Where-Object { $_.Trim() -ne "" } | Set-Content $path
