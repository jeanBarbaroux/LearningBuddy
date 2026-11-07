namespace LearningBuddy.Core;

public static class PackageImportTemplate
{
    /// <summary>
    /// Creates an importable example showing every card variant: a free-answer "Card",
    /// a single-answer "QCM" (radio buttons) and a multiple-answer "QCM" (checkboxes).
    /// </summary>
    public static string CreateJson()
    {
        return """
            {
              "format": "learning-buddy",
              "schemaVersion": 1,
              "title": "Mon paquet de révision",
              "cards": [
                {
                  "type": "Card",
                  "question": "Remplacez cette question",
                  "answer": "Remplacez cette réponse",
                  "explanation": "Explication facultative",
                  "language": "fr",
                  "tags": ["exemple"]
                },
                {
                  "type": "QCM",
                  "question": "Exemple de QCM à une seule bonne réponse : combien font 2 + 2 ?",
                  "choices": [
                    { "text": "3", "correct": false },
                    { "text": "4", "correct": true },
                    { "text": "5", "correct": false }
                  ],
                  "explanation": "Une seule bonne réponse : les choix s’affichent avec des boutons radio. Le champ « answer » est omis : la réponse reprend alors les bonnes réponses.",
                  "language": "fr",
                  "tags": ["exemple", "qcm"]
                },
                {
                  "type": "QCM",
                  "question": "Exemple de QCM à plusieurs bonnes réponses : quels nombres sont pairs ?",
                  "answer": "2 et 4 sont pairs.",
                  "choices": [
                    { "text": "1", "correct": false },
                    { "text": "2", "correct": true },
                    { "text": "3", "correct": false },
                    { "text": "4", "correct": true }
                  ],
                  "explanation": "Plusieurs bonnes réponses : les choix s’affichent avec des cases à cocher. Pour un QCM, « answer » est facultatif ; s’il est fourni, il s’affiche à la révélation.",
                  "language": "fr",
                  "tags": ["exemple", "qcm"]
                }
              ]
            }
            """;
    }
}
