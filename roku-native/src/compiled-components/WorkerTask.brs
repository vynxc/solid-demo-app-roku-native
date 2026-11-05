' Generic Task-thread worker.
'
' TypeScript cannot execute inside a SceneGraph Task (the Task thread runs
' BrightScript). The TS side posts { op, ... } and receives { ok, result }.
' Add operations here when an app needs genuinely parallel background work.

sub init()
    m.top.functionName = "runWorker"
end sub

sub runWorker()
    response = { ok: false, error: "invalid request", result: invalid }
    request = m.top.request

    if request = invalid then
        m.top.response = response
        return
    end if

    op = request.op

    if op = "echo" then
        response = { ok: true, error: "", result: request.value }
    else if op = "sleep" then
        ms = 0
        if request.ms <> invalid then ms = Int(request.ms)
        if ms > 0 then sleep(ms)
        response = { ok: true, error: "", result: ms }
    else if op = "json" then
        parsed = ParseJson(request.text)
        if parsed = invalid then
            response = { ok: false, error: "invalid json", result: invalid }
        else
            response = { ok: true, error: "", result: FormatJson(parsed) }
        end if
    else if op = "fetch" then
        transfer = CreateObject("roUrlTransfer")
        transfer.SetUrl(request.url)
        if request.headers <> invalid then
            for each key in request.headers
                transfer.AddHeader(key, request.headers[key])
            end for
        end if
        body = transfer.GetToString()
        response = { ok: true, error: "", result: body }
    else
        response = { ok: false, error: "unknown op: " + ToStr(op), result: invalid }
    end if

    m.top.response = response
end sub
