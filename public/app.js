// Rekog AI - client-side helpers: JSON highlighting, copy button, confirm dialogs, busy state

(function () {
    // build highlighted JSON from DOM nodes and textContent only - never innerHTML
    function span(className, text) {
        const el = document.createElement('span')
        el.className = className
        el.textContent = text
        return el
    }

    function renderJson(value, depth) {
        const frag = document.createDocumentFragment()
        const pad = '  '.repeat(depth)
        const text = t => document.createTextNode(t)

        if (value === null) {
            frag.append(span('j-null', 'null'))
        } else if (Array.isArray(value)) {
            if (!value.length) return text('[]')
            frag.append(text('[\n'))
            value.forEach((item, i) => {
                frag.append(text(pad + '  '), renderJson(item, depth + 1), text(i < value.length - 1 ? ',\n' : '\n'))
            })
            frag.append(text(pad + ']'))
        } else if (typeof value === 'object') {
            const keys = Object.keys(value)
            if (!keys.length) return text('{}')
            frag.append(text('{\n'))
            keys.forEach((key, i) => {
                frag.append(text(pad + '  '), span('j-key', JSON.stringify(key)), text(': '), renderJson(value[key], depth + 1), text(i < keys.length - 1 ? ',\n' : '\n'))
            })
            frag.append(text(pad + '}'))
        } else if (typeof value === 'string') {
            frag.append(span('j-str', JSON.stringify(value)))
        } else if (typeof value === 'number') {
            frag.append(span('j-num', String(value)))
        } else {
            frag.append(span('j-bool', String(value)))
        }
        return frag
    }

    document.querySelectorAll('pre[data-json]').forEach(pre => {
        const source = pre.textContent
        pre.dataset.source = source
        try {
            const parsed = JSON.parse(source)
            pre.replaceChildren(renderJson(parsed, 0))
        } catch {
            // leave the escaped plain text in place
        }
    })

    document.querySelectorAll('[data-copy]').forEach(button => {
        button.addEventListener('click', async () => {
            const target = document.getElementById(button.dataset.copy)
            const label = button.textContent
            try {
                await navigator.clipboard.writeText(target.dataset.source || target.textContent)
                button.textContent = 'Copied'
            } catch {
                button.textContent = 'Copy failed'
            }
            setTimeout(() => { button.textContent = label }, 1500)
        })
    })

    document.addEventListener('submit', event => {
        const form = event.target
        if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
            event.preventDefault()
            return
        }
        if ('busy' in form.dataset) {
            document.body.classList.add('is-busy')
            document.querySelectorAll('form[data-busy] button').forEach(b => { b.disabled = true })
        }
    })

    // back/forward cache can restore the disabled state
    window.addEventListener('pageshow', () => {
        document.body.classList.remove('is-busy')
        document.querySelectorAll('form[data-busy] button').forEach(b => { b.disabled = false })
    })
})()
